import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { idSchema, type Media } from "../shared/domain.ts";
import { localSecret } from "../server/secrets.ts";
import { executeTraining } from "./training.ts";
import { executeXiaohui } from "./xiaohui.ts";
import type { Outcome, Work } from "./types.ts";
try {
  process.loadEnvFile();
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
const dataDir = path.resolve(process.env.FLEET_DATA_DIR ?? ".data");
const token =
  process.env.FLEET_WORKER_TOKEN ??
  (await localSecret(dataDir, "worker-token"));
const api = process.env.FLEET_API_URL ?? "http://127.0.0.1:4178";
if (!["http:", "https:"].includes(new URL(api).protocol))
  throw new Error("Invalid API URL.");
if (
  new URL(api).protocol === "http:" &&
  !["127.0.0.1", "localhost", "server"].includes(new URL(api).hostname)
)
  throw new Error("Remote worker connections require HTTPS.");
const workerId = randomUUID();
let stopped = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    stopped = true;
  });
async function request<T>(route: string, body?: unknown): Promise<T> {
  const r = await fetch(api + "/api/internal" + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Worker API returned ${r.status}.`);
  return r.json() as Promise<T>;
}
console.log(
  "Fleet worker started. It only claims jobs explicitly queued in this workspace.",
);
while (!stopped) {
  let work: Work | null = null;
  try {
    work = await request<Work | null>("/claim", { workerId });
    if (work) {
      const job = work.job;
      idSchema.parse(job.id);
      const temporaryRoot = path.resolve(dataDir, "worker-temp"),
        temporary = path.resolve(temporaryRoot, job.id);
      if (!temporary.startsWith(temporaryRoot + path.sep))
        throw new Error("Invalid temporary job directory.");
      let leaseLost = false;
      const heartbeat = setInterval(() => {
        void request(`/jobs/${job.id}/heartbeat`, { workerId }).catch(() => {
          leaseLost = true;
        });
      }, 20000);
      const progress = async (step: string, detail: string) => {
        if (leaseLost)
          throw new Error(
            "Worker lease lost. Stop and reconcile the destination.",
          );
        await request(`/jobs/${job.id}/heartbeat`, { workerId, step, detail });
      };
      try {
        const download = async (id: string) => {
          const media = (job.payload.media ?? []) as Media[];
          const metadata = Array.isArray(media)
            ? media.find((m) => m.id === id)
            : (job.payload.media as Media);
          if (!metadata || metadata.id !== id)
            throw new Error("Media is outside this job snapshot.");
          const r = await fetch(
            api + "/api/internal/media/" + encodeURIComponent(id),
            {
              headers: { Authorization: "Bearer " + token },
              signal: AbortSignal.timeout(120000),
            },
          );
          if (!r.ok || !r.body) throw new Error("Could not retrieve media.");
          idSchema.parse(id);
          await mkdir(temporary, { recursive: true });
          const filename = path.join(
            temporary,
            id +
              "-" +
              path
                .basename(metadata.name)
                .replace(/[^a-zA-Z0-9._\-\u0e00-\u0e7f ]/g, "_"),
          );
          const hash = createHash("sha256");
          let size = 0;
          await pipeline(
            Readable.fromWeb(
              r.body as import("node:stream/web").ReadableStream,
            ),
            new Transform({
              transform(chunk: Buffer, _encoding, done) {
                size += chunk.length;
                if (size > metadata.size || size > 512 * 1024 * 1024)
                  return done(
                    new Error("Media size exceeds the frozen snapshot."),
                  );
                hash.update(chunk);
                done(null, chunk);
              },
            }),
            createWriteStream(filename, { flags: "w", mode: 0o600 }),
          );
          if (
            size !== metadata.size ||
            hash.digest("hex") !== metadata.checksum
          )
            throw new Error("Media checksum differs from the frozen snapshot.");
          return filename;
        };
        const output =
          job.mode === "training"
            ? await executeTraining(work, progress)
            : await executeXiaohui(work, progress, dataDir, download);
        if (!leaseLost)
          await request(`/jobs/${job.id}/complete`, { workerId, output });
        console.log(
          `${job.id}: ${leaseLost ? "lease lost; result unknown" : output.state}`,
        );
      } catch (error) {
        const output: Outcome = {
          state: "result_unknown",
          error:
            "Worker interrupted. Inspect the target before submitting another operation.",
          results: job.targetIds.map((id) => ({
            id,
            state: "unknown",
            message: "No trustworthy completion result.",
          })),
        };
        if (!leaseLost)
          await request(`/jobs/${job.id}/complete`, { workerId, output }).catch(
            () => {},
          );
        console.error(
          error instanceof Error ? error.message : "Worker failed.",
        );
      } finally {
        clearInterval(heartbeat);
        if (temporary.startsWith(temporaryRoot + path.sep))
          await rm(temporary, { recursive: true, force: true });
      }
    }
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Worker unavailable.",
    );
  }
  if (!stopped)
    await new Promise((resolve) => setTimeout(resolve, work ? 200 : 2000));
}
