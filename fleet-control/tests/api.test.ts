import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { openDatabase, getRecord, type Database } from "../server/db.ts";
import { buildApp } from "../server/app.ts";
import {
  blankProgram,
  newLayer,
  type Device,
  type FleetState,
  type Job,
  type Media,
  type Program,
} from "../shared/domain.ts";
import { executeTraining } from "../worker/training.ts";
import type { Work } from "../worker/types.ts";

let dir: string,
  db: Database,
  app: FastifyInstance,
  session = "",
  program: Program,
  media: Media;
const token = "test-worker-token-never-production";
const request = async (
  method: string,
  url: string,
  body?: unknown,
  cookie = session,
) =>
  app.inject({
    method: method as "GET",
    url: "/api" + url,
    payload: body as string,
    headers: { cookie, "x-fleet-request": "1" },
  });
const internal = async (url: string, body: unknown) =>
  app.inject({
    method: "POST",
    url: "/api/internal" + url,
    payload: body as string,
    headers: { authorization: "Bearer " + token },
  });
const state = async () => (await request("GET", "/state")).json<FleetState>();
const queue = async (
  command: Job["command"],
  targetIds: string[] = [],
  payload: Record<string, unknown> = {},
  key = randomUUID(),
) =>
  request("POST", "/jobs", {
    command,
    targetIds,
    payload,
    idempotencyKey: key,
  });
async function executeOne() {
  const r = await internal("/claim", { workerId: "test-worker" });
  assert.equal(r.statusCode, 200, r.body);
  const work = r.json<Work>();
  assert(work);
  const output = await executeTraining(work, async (step, detail) => {
    const h = await internal(`/jobs/${work.job.id}/heartbeat`, {
      workerId: "test-worker",
      step,
      detail,
    });
    assert.equal(h.statusCode, 200, h.body);
  });
  const finished = await internal(`/jobs/${work.job.id}/complete`, {
    workerId: "test-worker",
    output,
  });
  assert.equal(finished.statusCode, 200, finished.body);
  return finished.json<Job>();
}
before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "fleet-api-test-"));
  db = await openDatabase(dir);
  app = await buildApp({ db, dataDir: dir, workerToken: token });
  await app.ready();
});
after(async () => {
  await app.close();
  await db.close();
  assert(path.basename(dir).startsWith("fleet-api-test-"));
  await rm(dir, { recursive: true, force: true });
});
test("first run requires setup; data and worker routes are protected", async () => {
  assert.equal((await request("GET", "/state")).statusCode, 401);
  assert.equal((await request("GET", "/session")).json().initialized, false);
  assert.equal(
    (await request("POST", "/internal/claim", { workerId: "wrong" }))
      .statusCode,
    401,
  );
  const r = await request("POST", "/setup", {
    name: "Test owner",
    email: "owner@example.test",
    password: "local-test-passphrase",
  });
  assert.equal(r.statusCode, 200, r.body);
  session = r.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  assert.equal(
    (
      await request("POST", "/setup", {
        name: "Another",
        email: "other@example.test",
        password: "local-test-passphrase",
      })
    ).statusCode,
    409,
  );
});
test("browser writes require anti-CSRF header and valid origin", async () => {
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/logout",
        headers: { cookie: session },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/logout",
        headers: {
          cookie: session,
          "x-fleet-request": "1",
          origin: "https://attacker.example",
        },
      })
    ).statusCode,
    403,
  );
});
test("disconnected workspace saves drafts but refuses fleet operations", async () => {
  const r = await request("POST", "/programs", blankProgram("Test menu"));
  assert.equal(r.statusCode, 200, r.body);
  program = r.json();
  assert.equal((await queue("sync_fleet")).statusCode, 409);
});
test("training fleet is explicit, persistent and cannot be silently reinitialized", async () => {
  const r = await request("POST", "/training", {
    count: 6,
    confirm: "TRAINING",
  });
  assert.equal(r.statusCode, 200, r.body);
  const s = await state();
  assert.equal(s.devices.length, 6);
  assert.equal(s.connection.mode, "training");
  assert.equal(
    (await request("POST", "/training", { count: 6, confirm: "TRAINING" }))
      .statusCode,
    409,
  );
});
test("uploads validate content, detect duplicates, serve ranges and require login", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=",
    "base64",
  );
  const upload = async (bytes: Buffer, name = "image.png") => {
    const boundary = "fleet-test-boundary";
    return app.inject({
      method: "POST",
      url: "/api/media",
      headers: {
        cookie: session,
        "x-fleet-request": "1",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: image/png\r\n\r\n`,
        ),
        bytes,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
    });
  };
  const r = await upload(png);
  assert.equal(r.statusCode, 200, r.body);
  media = r.json().media;
  assert.equal((await upload(png)).json().duplicate, true);
  assert.equal(
    (await upload(Buffer.from("<script>alert(1)</script>"))).statusCode,
    415,
  );
  assert.equal(
    (await request("GET", `/media/${media.id}/file`, undefined, "")).statusCode,
    401,
  );
  const partial = await app.inject({
    method: "GET",
    url: `/api/media/${media.id}/file`,
    headers: { cookie: session, range: "bytes=0-7" },
  });
  assert.equal(partial.statusCode, 206);
  assert.equal(partial.rawPayload.length, 8);
  const approved = await request("PATCH", `/media/${media.id}`, {
    version: media.version,
    review: "approved",
  });
  assert.equal(approved.statusCode, 200, approved.body);
  media = approved.json();
});
test("save uses optimistic concurrency and revisions retain actual version numbers", async () => {
  const l = newLayer("image", program.screens[0]);
  l.mediaIds = [media.id];
  program.screens[0].layers = [l];
  const r = await request("PUT", `/programs/${program.id}`, program);
  assert.equal(r.statusCode, 200, r.body);
  const stale = structuredClone(program);
  program = r.json();
  assert.equal(program.version, 2);
  assert.equal(
    (await request("PUT", `/programs/${program.id}`, stale)).statusCode,
    409,
  );
  const history = (
    await request("GET", `/programs/${program.id}/revisions`)
  ).json<Program[]>();
  assert.deepEqual(history.map((p) => p.version).sort(), [1, 2]);
});
test("idempotency returns the same job; changing its body rejects key reuse", async () => {
  const key = randomUUID(),
    a = await queue("sync_fleet", [], {}, key),
    b = await queue("sync_fleet", [], {}, key);
  assert.equal(a.statusCode, 200, a.body);
  assert.equal(a.json().id, b.json().id);
  assert.equal(
    (await queue("sync_fleet", [], { different: true }, key)).statusCode,
    409,
  );
  const done = await executeOne();
  assert.equal(done.state, "succeeded");
});
test("create and rename group execute through the worker, then moving freezes targets", async () => {
  assert.equal(
    (
      await queue("create_group", [], {
        name: "New branch",
        parentId: "training-bangkok",
      })
    ).statusCode,
    200,
  );
  await executeOne();
  let group = (await state()).groups.find((g) => g.name === "New branch")!;
  assert(group);
  assert.equal(
    (
      await queue("rename_group", [], {
        id: group.id,
        name: "Renamed branch",
        version: group.version,
      })
    ).statusCode,
    200,
  );
  assert.equal((await executeOne()).state, "succeeded");
  group = (await state()).groups.find((g) => g.id === group.id)!;
  assert.equal(group.name, "Renamed branch");
  assert.equal(
    (await queue("move_devices", ["training-screen-1"], { groupId: group.id }))
      .statusCode,
    200,
  );
  await executeOne();
  assert.equal(
    (await state()).devices.find((d) => d.id === "training-screen-1")!.groupId,
    group.id,
  );
});
test("power schedule preserves prior reported value until verified; offline target fails separately", async () => {
  const schedule = {
    enabled: true,
    timezone: "Asia/Bangkok",
    rules: [{ days: [1, 2, 3, 4, 5], on: "22:00", off: "06:00" }],
  };
  const r = await queue(
    "set_power_schedule",
    ["training-screen-1", "training-screen-5"],
    { schedule },
  );
  assert.equal(r.statusCode, 200, r.body);
  let d = (await state()).devices.find((d) => d.id === "training-screen-1")!;
  assert.equal(d.settings.powerSchedule?.rules[0].on, "09:00");
  assert.equal(d.scheduleStatus, "pending");
  const done = await executeOne();
  assert.equal(done.state, "partial");
  assert.equal(
    done.results.find((r) => r.id === "training-screen-5")!.state,
    "failed",
  );
  d = (await state()).devices.find((d) => d.id === "training-screen-1")!;
  assert.equal(d.settings.powerSchedule?.rules[0].on, "22:00");
});
test("publishing freezes the draft; completion does not overwrite a newer edited draft", async () => {
  const r = await queue("publish_program", ["training-screen-1"], {
    programId: program.id,
    version: program.version,
    confirm: "PUBLISH",
    mode: "append",
  });
  assert.equal(r.statusCode, 200, r.body);
  const snapshot = r.json<Job>().payload.program as Program;
  const saved = await request("PUT", `/programs/${program.id}`, {
    ...program,
    name: "Newer draft",
  });
  assert.equal(saved.statusCode, 200, saved.body);
  program = saved.json();
  assert.equal((await executeOne()).state, "succeeded");
  const s = await state();
  assert.equal(
    s.devices.find((d) => d.id === "training-screen-1")!.settings.programName,
    snapshot.name,
  );
  program = s.programs.find((p) => p.id === program.id)!;
  assert.equal(program.name, "Newer draft");
  assert.equal(program.lastPublishedVersion, snapshot.version);
  const next = await request("PUT", `/programs/${program.id}`, {
    ...program,
    name: "Save after publish",
  });
  assert.equal(next.statusCode, 200, next.body);
  program = next.json();
});
test("clear keeps identity, dimensions, library media, physical assignments and power schedules", async () => {
  const before = await state(),
    d = before.devices.find((d) => d.id === "training-screen-1")!;
  const r = await request("POST", `/programs/${program.id}/clear`, {
    version: program.version,
    confirm: "CLEAR",
  });
  assert.equal(r.statusCode, 200, r.body);
  const cleared = r.json<Program>();
  assert.equal(cleared.id, program.id);
  assert.equal(cleared.name, program.name);
  assert.equal(cleared.screens[0].width, 1080);
  assert.equal(cleared.screens[0].layers.length, 0);
  program = cleared;
  const after = await state();
  assert.equal(after.media.length, before.media.length);
  const displayed = after.publishedPrograms.find(
    (p) =>
      p.id === d.settings.programId && p.version === d.settings.programVersion,
  );
  assert(displayed);
  assert.equal(
    displayed.screens[0].layers.length,
    1,
    "published preview stays intact after draft clearing",
  );
  assert.deepEqual(
    after.devices.find((x) => x.id === d.id)!.settings,
    d.settings,
  );
  assert.equal((await request("DELETE", `/media/${media.id}`)).statusCode, 409);
  assert.equal(
    (
      await queue("publish_program", [d.id], {
        programId: program.id,
        version: program.version,
        confirm: "PUBLISH",
      })
    ).statusCode,
    400,
  );
});
test("restoring a revision creates a new draft and leaves screens alone", async () => {
  const history = (
    await request("GET", `/programs/${program.id}/revisions`)
  ).json<(Program & { programId: string })[]>();
  const original = history.find((r) => r.version === 2)!;
  const r = await request("POST", `/programs/${program.id}/action`, {
    action: "restore_revision",
    revisionId: original.id,
    version: program.version,
  });
  assert.equal(r.statusCode, 200, r.body);
  program = r.json();
  assert.equal(program.screens[0].layers.length, 1);
  assert(program.version > original.version);
});
test("viewer cannot edit; operator is restricted to assigned device groups", async () => {
  for (const [email, role, groupIds] of [
    ["viewer@example.test", "viewer", []],
    ["operator@example.test", "operator", ["training-chiangmai"]],
  ] as const) {
    const r = await request("POST", "/users", {
      name: role,
      email,
      password: "role-test-passphrase",
      role,
      groupIds,
    });
    assert.equal(r.statusCode, 200, r.body);
  }
  let r = await request(
    "POST",
    "/login",
    { email: "viewer@example.test", password: "role-test-passphrase" },
    "",
  );
  const viewer = r.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  assert.equal(
    (await request("POST", "/programs", blankProgram("Forbidden"), viewer))
      .statusCode,
    403,
  );
  r = await request(
    "POST",
    "/login",
    { email: "operator@example.test", password: "role-test-passphrase" },
    "",
  );
  const operator = r.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  assert.equal(
    (
      await request(
        "POST",
        "/jobs",
        {
          command: "device_control",
          targetIds: ["training-screen-1"],
          payload: { action: "volume", value: 20 },
          idempotencyKey: randomUUID(),
        },
        operator,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (await request("GET", "/state", undefined, operator)).json<FleetState>()
      .devices.length,
    2,
  );
});
test("permitted IDs, paused connector and batch limits are enforced on the server", async () => {
  await request("PATCH", "/connection", { maxTargets: 1 });
  assert.equal(
    (await queue("refresh_device", ["training-screen-1", "training-screen-2"]))
      .statusCode,
    400,
  );
  await request("PATCH", "/connection", { paused: true });
  assert.equal((await queue("sync_fleet")).statusCode, 409);
  assert.equal(
    (await internal("/claim", { workerId: "test-worker" })).json(),
    null,
  );
  await request("PATCH", "/connection", { paused: false, maxTargets: 500 });
});
test("expired lease is marked result_unknown and never automatically replayed", async () => {
  const r = await queue("device_control", ["training-screen-1"], {
    action: "volume",
    value: 35,
  });
  assert.equal(r.statusCode, 200, r.body);
  const work = (
    await internal("/claim", { workerId: "crashed-worker" })
  ).json<Work>();
  assert(work);
  await db.query(
    "UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=$1",
    [work.job.id],
  );
  assert.equal(
    (await internal("/claim", { workerId: "replacement-worker" })).json(),
    null,
  );
  const j = (await state()).jobs.find((j) => j.id === work.job.id)!;
  assert.equal(j.state, "result_unknown");
  assert.equal(j.attempts, 1);
});
test("approval requires a different person, and stopped jobs can be cancelled", async () => {
  await request("PATCH", "/connection", { requirePublishApproval: true });
  program = (await state()).programs.find((p) => p.id === program.id)!;
  let r = await request("POST", `/programs/${program.id}/action`, {
    action: "submit",
    version: program.version,
  });
  program = r.json();
  r = await request("POST", `/programs/${program.id}/action`, {
    action: "approve",
    version: program.version,
  });
  program = r.json();
  r = await queue("publish_program", ["training-screen-1"], {
    programId: program.id,
    version: program.version,
    confirm: "PUBLISH",
  });
  assert.equal(r.statusCode, 200, r.body);
  const j = r.json<Job>();
  assert.equal(j.state, "awaiting_approval");
  assert.equal(
    (await request("POST", `/jobs/${j.id}/action`, { action: "approve" }))
      .statusCode,
    409,
  );
  assert.equal(
    (await request("POST", `/jobs/${j.id}/action`, { action: "cancel" })).json()
      .state,
    "cancelled",
  );
  await request("PATCH", "/connection", { requirePublishApproval: false });
});
test("database survives closing and reopening; login and drafts remain", async () => {
  const before = await state();
  await app.close();
  await db.close();
  db = await openDatabase(dir);
  app = await buildApp({ db, dataDir: dir, workerToken: token });
  await app.ready();
  const after = await state();
  assert.equal(after.programs.length, before.programs.length);
  assert.equal(
    after.programs.find((p) => p.id === program.id)!.name,
    program.name,
  );
  assert.equal(after.user.email, "owner@example.test");
  assert(after.audit.some((a) => a.action === "program.cleared"));
});
