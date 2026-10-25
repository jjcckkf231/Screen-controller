import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  commands,
  idSchema,
  nameSchema,
  powerScheduleSchema,
  type Connection,
  type Device,
  type Group,
  type Job,
  type Media,
  type Playlist,
  type Program,
  type User,
} from "../shared/domain.ts";
import { allow, digest, requireDevices } from "./auth.ts";
import {
  audit,
  fail,
  getRecord,
  listRecords,
  lockWorkspace,
  putRecord,
  requireRecord,
  type Database,
  type Sql,
} from "./db.ts";
import { collectMediaIds } from "./training.ts";

const jobColumns = `id,command,state,payload,target_ids AS "targetIds",results,error,requested_by AS "requestedBy",approved_by AS "approvedBy",created_at AS "createdAt",updated_at AS "updatedAt",idempotency_key AS "idempotencyKey",mode,attempts,worker_id AS "workerId",lease_until AS "leaseUntil"`;
export async function getJob(db: Sql, id: string) {
  const j = (
    await db.query<Job>(`SELECT ${jobColumns} FROM jobs WHERE id=$1`, [id])
  ).rows[0];
  if (!j) return fail(404, "NOT_FOUND", "Job not found.");
  return j;
}
export async function listJobs(db: Sql, limit = 150) {
  return (
    await db.query<Job>(
      `SELECT ${jobColumns} FROM jobs ORDER BY created_at DESC LIMIT $1`,
      [limit],
    )
  ).rows;
}
export const jobRequest = z.object({
  command: z.enum(commands),
  targetIds: z.array(idSchema).max(500).default([]),
  payload: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().min(16).max(100),
});
const operating = ["owner", "operator"] as const;
const publishing = new Set([
  "publish_program",
  "publish_playlist",
  "remove_program",
]);
const targetCommands = new Set([
  "refresh_device",
  "move_devices",
  "rename_device",
  "publish_program",
  "publish_playlist",
  "remove_program",
  "set_power_schedule",
  "device_control",
]);
export async function enqueue(
  db: Database,
  user: User,
  input: unknown,
): Promise<Job> {
  const request = jobRequest.parse(input),
    hash = digest(JSON.stringify({ ...request, actor: user.id }));
  return db.transaction(async (tx) => {
    await lockWorkspace(tx);
    const previous = (
      await tx.query<{ id: string; request_hash: string }>(
        "SELECT id,request_hash FROM jobs WHERE idempotency_key=$1",
        [request.idempotencyKey],
      )
    ).rows[0];
    if (previous) {
      if (previous.request_hash !== hash)
        fail(
          409,
          "IDEMPOTENCY_CONFLICT",
          "This request key was already used for different content.",
        );
      return getJob(tx, previous.id);
    }
    const c = await requireRecord<Connection>(tx, "connection", "primary");
    if (c.mode === "disconnected")
      fail(
        409,
        "NOT_CONNECTED",
        "Connect a test fleet or explicitly start a training workspace first.",
      );
    if (c.paused) fail(409, "PAUSED", "The connector is paused.");
    if (!c.capabilities.includes(request.command))
      fail(
        409,
        "NOT_COMMISSIONED",
        "This action has not been commissioned for this connection.",
      );
    const ids = [...new Set(request.targetIds)];
    if (targetCommands.has(request.command) && !ids.length)
      fail(400, "NO_TARGETS", "Select at least one screen.");
    if (ids.length > c.maxTargets)
      fail(
        400,
        "BATCH_LIMIT",
        `This connection permits ${c.maxTargets} screens per operation.`,
      );
    if (ids.some((id) => !c.allowedDeviceIds.includes(id)))
      fail(403, "TEST_FLEET_ONLY", "A target is outside the permitted fleet.");
    const devices = await Promise.all(
      ids.map((id) => requireRecord<Device>(tx, "device", id)),
    );
    requireDevices(user, devices, await listRecords<Group>(tx, "group"));
    const p = request.payload;
    let payload: Record<string, unknown> = {};
    switch (request.command) {
      case "sync_fleet":
      case "refresh_device":
        allow(user, ["owner", "operator", "editor", "reviewer", "viewer"]);
        break;
      case "create_group": {
        allow(user, ["owner"]);
        const data = z
          .object({ name: nameSchema, parentId: idSchema.nullable() })
          .parse(p);
        if (data.parentId) await requireRecord(tx, "group", data.parentId);
        payload = { ...data, id: randomUUID() };
        break;
      }
      case "rename_group": {
        allow(user, ["owner"]);
        const data = z
          .object({ id: idSchema, name: nameSchema, version: z.number().int() })
          .parse(p);
        const group = await requireRecord<Group>(tx, "group", data.id);
        if (group.version !== data.version)
          fail(
            409,
            "VERSION_CONFLICT",
            "Group changed. Refresh before renaming.",
          );
        payload = { ...data };
        break;
      }
      case "move_devices": {
        allow(user, [...operating]);
        const data = z.object({ groupId: idSchema.nullable() }).parse(p);
        if (data.groupId) await requireRecord(tx, "group", data.groupId);
        requireDevices(
          user,
          devices.map((d) => ({ ...d, groupId: data.groupId })),
          await listRecords<Group>(tx, "group"),
        );
        payload = data;
        break;
      }
      case "rename_device":
        allow(user, [...operating]);
        if (ids.length !== 1)
          fail(400, "ONE_DEVICE", "Rename one screen at a time.");
        payload = z.object({ name: nameSchema }).parse(p);
        break;
      case "set_power_schedule":
        allow(user, [...operating]);
        payload = { schedule: powerScheduleSchema.parse(p.schedule) };
        if (devices.some((d) => !d.capabilities.includes("power_schedule")))
          fail(
            409,
            "UNSUPPORTED",
            "Power scheduling is not supported by every selected player.",
          );
        break;
      case "device_control": {
        allow(user, [...operating]);
        const data = z
          .object({
            action: z.enum([
              "brightness",
              "volume",
              "rotation",
              "power",
              "restart",
              "screenshot",
            ]),
            value: z.union([z.number(), z.string()]).optional(),
          })
          .parse(p);
        if (devices.some((d) => !d.capabilities.includes(data.action)))
          fail(
            409,
            "UNSUPPORTED",
            "This control is not supported by every selected player.",
          );
        if (["brightness", "volume"].includes(data.action))
          z.number().int().min(0).max(100).parse(data.value);
        if (data.action === "rotation")
          z.union([
            z.literal(0),
            z.literal(90),
            z.literal(180),
            z.literal(270),
          ]).parse(data.value);
        if (data.action === "power") z.enum(["on", "off"]).parse(data.value);
        if (data.action === "restart" && p.confirm !== "RESTART")
          fail(
            400,
            "CONFIRM_REQUIRED",
            "Confirm restart of the selected screens.",
          );
        payload = data;
        break;
      }
      case "upload_media": {
        allow(user, ["owner", "editor"]);
        const m = await requireRecord<Media>(
          tx,
          "media",
          idSchema.parse(p.mediaId),
        );
        if (m.review !== "approved")
          fail(
            409,
            "REVIEW_REQUIRED",
            "Approve this media before uploading it to Xiaohui.",
          );
        payload = { media: m };
        break;
      }
      case "sync_program":
      case "publish_program": {
        allow(
          user,
          request.command === "publish_program"
            ? [...operating]
            : ["owner", "editor"],
        );
        const program = await requireRecord<Program>(
          tx,
          "program",
          idSchema.parse(p.programId),
        );
        if (program.deletedAt)
          fail(410, "DELETED", "This program is in the archive.");
        if (program.version !== z.number().int().parse(p.version))
          fail(
            409,
            "VERSION_CONFLICT",
            "Program changed. Review the newest version.",
          );
        if (
          program.screens.every((s) => !s.layers.length) &&
          p.confirmEmpty !== true
        )
          fail(
            400,
            "EMPTY_PROGRAM",
            "The program is empty. Explicitly confirm publishing an empty program.",
          );
        const media = await Promise.all(
          collectMediaIds(program).map((id) =>
            requireRecord<Media>(tx, "media", id),
          ),
        );
        if (media.some((m) => m.review !== "approved"))
          fail(
            409,
            "MEDIA_REVIEW_REQUIRED",
            "All referenced media must be approved.",
          );
        if (request.command === "publish_program") {
          if (p.confirm !== "PUBLISH")
            fail(400, "CONFIRM_REQUIRED", "Review and confirm publishing.");
          if (c.requirePublishApproval && program.status !== "approved")
            fail(
              409,
              "PROGRAM_REVIEW_REQUIRED",
              "Submit this program for review first.",
            );
          if (
            program.screens.length === 1 &&
            devices.some(
              (d) =>
                d.settings.width !== program.screens[0].width ||
                d.settings.height !== program.screens[0].height,
            ) &&
            p.allowFit !== true
          )
            fail(
              400,
              "RESOLUTION_MISMATCH",
              "Screen dimensions differ. Confirm fitting or use a matching program.",
            );
        }
        payload = {
          program: structuredClone(program),
          media,
          mode: z.enum(["append", "replace"]).default("append").parse(p.mode),
          allowFit: p.allowFit === true,
          confirmEmpty: p.confirmEmpty === true,
        };
        if (payload.mode === "replace" && p.confirmReplace !== "REPLACE")
          fail(
            400,
            "CONFIRM_REQUIRED",
            "Replacing clears the existing playback assignment. Confirm replace explicitly.",
          );
        break;
      }
      case "remove_program":
        allow(user, [...operating]);
        if (p.confirm !== "REMOVE")
          fail(
            400,
            "CONFIRM_REQUIRED",
            "Confirm removal from the selected screens.",
          );
        payload = { programId: idSchema.parse(p.programId) };
        break;
      case "publish_playlist": {
        allow(user, [...operating]);
        if (p.confirm !== "PUBLISH")
          fail(400, "CONFIRM_REQUIRED", "Confirm playlist publishing.");
        const playlist = await requireRecord<Playlist>(
          tx,
          "playlist",
          idSchema.parse(p.playlistId),
        );
        if (!playlist.programIds.length)
          fail(400, "EMPTY_PLAYLIST", "Add programs to the playlist first.");
        const programs = await Promise.all(
          playlist.programIds.map((id) =>
            requireRecord<Program>(tx, "program", id),
          ),
        );
        if (
          programs.some(
            (program) =>
              program.deletedAt ||
              (c.requirePublishApproval && program.status !== "approved"),
          )
        )
          fail(
            409,
            "PROGRAM_REVIEW_REQUIRED",
            "Playlist contains an archived or unapproved program.",
          );
        const media = await Promise.all(
          [...new Set(programs.flatMap(collectMediaIds))].map((id) =>
            requireRecord<Media>(tx, "media", id),
          ),
        );
        if (media.some((m) => m.review !== "approved"))
          fail(
            409,
            "MEDIA_REVIEW_REQUIRED",
            "Approve playlist media before publishing.",
          );
        payload = { playlist, programs, media };
        break;
      }
    }
    // Freeze identities and versions now; a later group edit cannot expand this batch.
    payload.targets = devices.map((d) => ({
      id: d.id,
      externalId: d.externalId,
      name: d.name,
      version: d.version,
    }));
    payload.expectedAccount = c.verifiedAccount;
    const id = randomUUID(),
      state =
        c.requirePublishApproval && publishing.has(request.command)
          ? "awaiting_approval"
          : "queued";
    await tx.query(
      "INSERT INTO jobs(id,command,state,payload,target_ids,requested_by,idempotency_key,request_hash,mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        id,
        request.command,
        state,
        JSON.stringify(payload),
        JSON.stringify(ids),
        user.id,
        request.idempotencyKey,
        hash,
        c.mode,
      ],
    );
    if (request.command === "set_power_schedule")
      for (const d of devices)
        await putRecord(tx, "device", d.id, {
          ...d,
          desiredSchedule: payload.schedule,
          scheduleStatus: "pending",
        });
    await audit(tx, user.id, "job.request", id, {
      command: request.command,
      targetIds: ids,
      state,
    });
    return getJob(tx, id);
  });
}
export async function claim(db: Database, workerId: string) {
  return db.transaction(async (tx) => {
    await lockWorkspace(tx);
    const c = await requireRecord<Connection>(tx, "connection", "primary");
    await putRecord(tx, "connection", "primary", {
      ...c,
      workerLastSeenAt: new Date().toISOString(),
    });
    // An expired lease may have already performed a write. Never blindly replay it.
    const expired = await tx.query<{ id: string }>(
      "UPDATE jobs SET state='result_unknown',error='Worker lease expired. Inspect the destination before creating another job.',updated_at=now() WHERE state IN ('running','verifying') AND lease_until<now() RETURNING id",
    );
    for (const j of expired.rows)
      await audit(tx, "worker", "job.lease_expired", j.id);
    if (c.paused || c.mode === "disconnected") return null;
    if (
      (
        await tx.query(
          "SELECT id FROM jobs WHERE state IN ('running','verifying') LIMIT 1",
        )
      ).rows.length
    )
      return null;
    const row = (
      await tx.query<{ id: string }>(
        "SELECT id FROM jobs WHERE state='queued' AND mode=$1 ORDER BY created_at LIMIT 1 FOR UPDATE",
        [c.mode],
      )
    ).rows[0];
    if (!row) return null;
    const job = await getJob(tx, row.id);
    const requester = (
      await tx.query<User>(
        `SELECT id,name,email,role,group_ids AS "groupIds" FROM users WHERE id=$1 AND disabled=false`,
        [job.requestedBy],
      )
    ).rows[0];
    if (!requester) {
      await tx.query(
        "UPDATE jobs SET state='needs_human',error='Requesting account has been disabled.',updated_at=now() WHERE id=$1",
        [job.id],
      );
      return null;
    }
    const scopedDevices = await Promise.all(
      job.targetIds.map((id) => getRecord<Device>(tx, "device", id)),
    );
    if (scopedDevices.some((d) => !d)) {
      await tx.query(
        "UPDATE jobs SET state='needs_human',error='A target device is no longer available.',updated_at=now() WHERE id=$1",
        [job.id],
      );
      return null;
    }
    try {
      requireDevices(
        requester,
        scopedDevices as Device[],
        await listRecords<Group>(tx, "group"),
      );
    } catch {
      await tx.query(
        "UPDATE jobs SET state='needs_human',error='Requester no longer has access to these targets.',updated_at=now() WHERE id=$1",
        [job.id],
      );
      return null;
    }
    if (
      !c.capabilities.includes(job.command) ||
      job.targetIds.some((id) => !c.allowedDeviceIds.includes(id)) ||
      job.payload.expectedAccount !== c.verifiedAccount
    ) {
      await tx.query(
        "UPDATE jobs SET state='needs_human',error='Connection or permitted targets changed since this request.',updated_at=now() WHERE id=$1",
        [row.id],
      );
      return null;
    }
    await tx.query(
      "UPDATE jobs SET state='running',attempts=attempts+1,worker_id=$2,lease_until=now()+interval '90 seconds',updated_at=now() WHERE id=$1",
      [row.id, workerId],
    );
    await audit(tx, "worker", "job.started", row.id);
    return {
      job: await getJob(tx, row.id),
      connection: c,
      devices: await listRecords<Device>(
        tx,
        c.mode === "training" ? "training-device" : "device",
      ),
      groups: await listRecords<Group>(
        tx,
        c.mode === "training" ? "training-group" : "group",
      ),
    };
  });
}
export async function transitionJob(
  db: Database,
  user: User,
  id: string,
  action: "approve" | "cancel",
) {
  return db.transaction(async (tx) => {
    await lockWorkspace(tx);
    const job = await getJob(tx, id);
    if (action === "approve") {
      allow(user, ["owner", "reviewer"]);
      if (job.requestedBy === user.id)
        fail(
          409,
          "SECOND_PERSON_REQUIRED",
          "A different reviewer must approve this operation.",
        );
      if (job.state !== "awaiting_approval")
        fail(409, "INVALID_STATE", "Only pending approvals can be approved.");
      await tx.query(
        "UPDATE jobs SET state='queued',approved_by=$2,updated_at=now() WHERE id=$1",
        [id, user.id],
      );
    } else {
      if (job.requestedBy !== user.id) allow(user, ["owner"]);
      if (!["queued", "awaiting_approval"].includes(job.state))
        fail(
          409,
          "INVALID_STATE",
          "Only jobs that have not started can be cancelled. Pause the connector to stop subsequent jobs.",
        );
      await tx.query(
        "UPDATE jobs SET state='cancelled',updated_at=now() WHERE id=$1",
        [id],
      );
    }
    await audit(tx, user.id, `job.${action}`, id);
    return getJob(tx, id);
  });
}

export const resultSchema = z.object({
  state: z.enum([
    "succeeded",
    "partial",
    "failed",
    "needs_human",
    "result_unknown",
  ]),
  error: z.string().max(2000).nullable().default(null),
  results: z
    .array(
      z.object({
        id: idSchema,
        state: z.enum(["succeeded", "failed", "unknown", "pending"]),
        message: z.string().max(2000),
        evidence: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .max(500),
  devices: z.array(z.custom<Device>()).max(500).default([]),
  groups: z.array(z.custom<Group>()).max(1000).default([]),
  externalProgramId: z.string().max(150).optional(),
  externalMediaId: z.string().max(150).optional(),
});
export async function complete(
  db: Database,
  id: string,
  workerId: string,
  raw: unknown,
) {
  const output = resultSchema.parse(raw);
  return db.transaction(async (tx) => {
    await lockWorkspace(tx);
    const job = await getJob(tx, id);
    if (
      job.workerId !== workerId ||
      !["running", "verifying"].includes(job.state) ||
      !job.leaseUntil ||
      Date.parse(String(job.leaseUntil)) < Date.now()
    )
      fail(409, "LEASE_LOST", "This worker no longer owns this job.");
    if (
      job.targetIds.length &&
      (output.results.length !== job.targetIds.length ||
        new Set(output.results.map((r) => r.id)).size !==
          job.targetIds.length ||
        output.results.some((r) => !job.targetIds.includes(r.id)))
    )
      fail(
        400,
        "INVALID_RESULTS",
        "Every frozen target must have exactly one result.",
      );
    if (
      output.state === "succeeded" &&
      output.results.some((r) => r.state !== "succeeded")
    )
      fail(
        400,
        "FALSE_SUCCESS",
        "A successful job requires a verified result for every target.",
      );
    const c = await requireRecord<Connection>(tx, "connection", "primary");
    for (const d of output.devices) {
      idSchema.parse(d.id);
      idSchema.parse(d.externalId);
      nameSchema.parse(d.name);
      if (job.command !== "sync_fleet" && !job.targetIds.includes(d.id))
        fail(400, "UNEXPECTED_DEVICE", "Unexpected device in worker output.");
      if (c.mode === "training" && !d.externalId.startsWith("TRAIN-"))
        fail(
          400,
          "INVALID_TRAINING_DEVICE",
          "A training result cannot contain real device IDs.",
        );
      if (d.settings.powerSchedule)
        powerScheduleSchema.parse(d.settings.powerSchedule);
      const previous = await getRecord<Device>(tx, "device", d.id);
      await putRecord(tx, "device", d.id, {
        ...previous,
        ...d,
        version: (previous?.version ?? 0) + 1,
      });
      if (job.mode === "training")
        await putRecord(tx, "training-device", d.id, d);
    }
    if (job.command === "set_power_schedule")
      for (const result of output.results) {
        const device = await getRecord<Device>(tx, "device", result.id);
        if (device)
          await putRecord(tx, "device", device.id, {
            ...device,
            scheduleStatus:
              result.state === "succeeded"
                ? "verified"
                : result.state === "failed"
                  ? "failed"
                  : "unknown",
          });
      }
    if (job.command === "sync_fleet" && output.state === "succeeded") {
      const seen = new Set(output.devices.map((d) => d.id));
      for (const previous of await listRecords<Device>(tx, "device"))
        if (!seen.has(previous.id))
          await putRecord(tx, "device", previous.id, {
            ...previous,
            online: null,
            settings: {
              ...previous.settings,
              observedAt: null,
              source: "missing-from-latest-fleet-read",
            },
          });
    }
    for (const g of output.groups) {
      idSchema.parse(g.id);
      nameSchema.parse(g.name);
      if (!["sync_fleet", "create_group", "rename_group"].includes(job.command))
        fail(400, "UNEXPECTED_GROUP", "Unexpected group update.");
      const previous = await getRecord<Group>(tx, "group", g.id);
      await putRecord(tx, "group", g.id, {
        ...g,
        version: (previous?.version ?? 0) + 1,
      });
      if (job.mode === "training")
        await putRecord(tx, "training-group", g.id, g);
    }
    if (
      output.state === "succeeded" &&
      output.externalMediaId &&
      job.command === "upload_media"
    ) {
      const m = await getRecord<Media>(
        tx,
        "media",
        (job.payload.media as Media).id,
      );
      if (m)
        await putRecord(tx, "media", m.id, {
          ...m,
          externalId: output.externalMediaId,
        });
    }
    if (
      ["succeeded", "partial"].includes(output.state) &&
      ["sync_program", "publish_program"].includes(job.command)
    ) {
      const snapshot = job.payload.program as Program,
        current = await getRecord<Program>(tx, "program", snapshot.id);
      if (current)
        await tx.query(
          "UPDATE records SET body=$1,updated_at=now() WHERE kind='program' AND id=$2",
          [
            JSON.stringify({
              ...current,
              externalId: output.externalProgramId ?? current.externalId,
              lastPublishedVersion:
                job.command === "publish_program"
                  ? snapshot.version
                  : current.lastPublishedVersion,
            }),
            current.id,
          ],
        );
    }
    if (
      ["succeeded", "partial"].includes(output.state) &&
      ["publish_program", "publish_playlist"].includes(job.command)
    ) {
      const snapshots =
        job.command === "publish_program"
          ? [job.payload.program as Program]
          : (job.payload.programs as Program[]);
      for (const snapshot of snapshots)
        await tx.query(
          "INSERT INTO records(kind,id,version,body) VALUES('published-program',$1,1,$2) ON CONFLICT DO NOTHING",
          [`${snapshot.id}-${snapshot.version}`, JSON.stringify(snapshot)],
        );
    }
    const failures =
      output.state === "succeeded" ? 0 : c.consecutiveFailures + 1;
    await putRecord(tx, "connection", "primary", {
      ...c,
      lastSyncAt:
        job.command === "sync_fleet" && output.state === "succeeded"
          ? new Date().toISOString()
          : c.lastSyncAt,
      lastError: output.error,
      consecutiveFailures: failures,
      paused: c.paused || failures >= 3,
    });
    await tx.query(
      "UPDATE jobs SET state=$2,results=$3,error=$4,lease_until=NULL,updated_at=now() WHERE id=$1",
      [id, output.state, JSON.stringify(output.results), output.error],
    );
    await audit(tx, "worker", "job.finished", id, {
      state: output.state,
      results: output.results,
    });
    return getJob(tx, id);
  });
}
