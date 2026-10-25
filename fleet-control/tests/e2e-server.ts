import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../server/app.ts";
import { openDatabase } from "../server/db.ts";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "fleet-browser-test-"));
const db = await openDatabase(dataDir),
  workerToken = "temporary-browser-test-token";
const app = await buildApp({
  db,
  dataDir,
  workerToken,
  distDir: path.resolve("dist"),
});
await app.listen({ host: "127.0.0.1", port: 4179 });
const worker = spawn(process.execPath, ["--import", "tsx", "worker/main.ts"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    FLEET_DATA_DIR: dataDir,
    FLEET_WORKER_TOKEN: workerToken,
    FLEET_API_URL: "http://127.0.0.1:4179",
  },
  stdio: "ignore",
  windowsHide: true,
});
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  worker.kill();
  await app.close();
  await db.close();
  if (path.basename(dataDir).startsWith("fleet-browser-test-"))
    await rm(dataDir, { recursive: true, force: true });
  process.exit(0);
};
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => void stop());
