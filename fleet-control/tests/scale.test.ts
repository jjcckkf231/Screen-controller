import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { buildApp } from "../server/app.ts";
import { openDatabase } from "../server/db.ts";
import { executeTraining } from "../worker/training.ts";
import type { FleetState, Job } from "../shared/domain.ts";
import type { Work } from "../worker/types.ts";
import { acquireServerLock } from "../server/lock.ts";

test("500-screen local fleet persists, targets exactly 500 IDs and records the offline exception", async (context) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "fleet-scale-test-")),
    db = await openDatabase(dir),
    token = "scale-test-worker";
  const app = await buildApp({ db, dataDir: dir, workerToken: token });
  await app.ready();
  try {
    let r = await app.inject({
      method: "POST",
      url: "/api/setup",
      headers: { "x-fleet-request": "1" },
      payload: {
        name: "Scale test",
        email: "scale@example.test",
        password: "scale-test-passphrase",
      },
    });
    assert.equal(r.statusCode, 200, r.body);
    const cookie = r.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      headers = { cookie, "x-fleet-request": "1" };
    const start = performance.now();
    r = await app.inject({
      method: "POST",
      url: "/api/training",
      headers,
      payload: { count: 500, confirm: "TRAINING" },
    });
    assert.equal(r.statusCode, 200, r.body);
    r = await app.inject({ method: "GET", url: "/api/state", headers });
    const state = r.json<FleetState>();
    assert.equal(state.devices.length, 500);
    const ids = state.devices.map((d) => d.id);
    assert.equal(new Set(ids).size, 500);
    r = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers,
      payload: {
        command: "device_control",
        targetIds: ids,
        payload: { action: "volume", value: 30 },
        idempotencyKey: randomUUID(),
      },
    });
    assert.equal(r.statusCode, 200, r.body);
    r = await app.inject({
      method: "POST",
      url: "/api/internal/claim",
      headers: { authorization: "Bearer " + token },
      payload: { workerId: "scale-worker" },
    });
    const work = r.json<Work>();
    assert.equal(work.job.targetIds.length, 500);
    const output = await executeTraining(work, async () => {});
    assert.equal(output.state, "partial");
    assert.equal(
      output.results.filter((r) => r.state === "succeeded").length,
      499,
    );
    r = await app.inject({
      method: "POST",
      url: `/api/internal/jobs/${work.job.id}/complete`,
      headers: { authorization: "Bearer " + token },
      payload: { workerId: "scale-worker", output },
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json<Job>().results.length, 500);
    r = await app.inject({ method: "GET", url: "/api/state", headers });
    const after = r.json<FleetState>();
    assert.equal(
      after.devices.filter((d) => d.settings.volume === 30).length,
      499,
    );
    assert.equal(after.devices.find((d) => !d.online)!.settings.volume, 40);
    context.diagnostic(
      `500-screen initialization, queue, worker simulation, verification and read-back: ${(performance.now() - start).toFixed(0)} ms. This is not a live-cloud load benchmark.`,
    );
  } finally {
    await app.close();
    await db.close();
    assert(path.basename(dir).startsWith("fleet-scale-test-"));
    await rm(dir, { recursive: true, force: true });
  }
});
test("one local data directory cannot be opened by two server owners", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "fleet-lock-test-"));
  try {
    const release = await acquireServerLock(dir);
    await assert.rejects(() => acquireServerLock(dir), /running server/);
    await release();
    const second = await acquireServerLock(dir);
    await second();
  } finally {
    assert(path.basename(dir).startsWith("fleet-lock-test-"));
    await rm(dir, { recursive: true, force: true });
  }
});
