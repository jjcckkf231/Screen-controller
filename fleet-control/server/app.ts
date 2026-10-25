import Fastify, { type FastifyReply } from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { z, ZodError } from "zod";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createWriteStream, createReadStream, existsSync } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import {
  commands,
  idSchema,
  nameSchema,
  powerScheduleSchema,
  programInputSchema,
  roles,
  type Connection,
  type Device,
  type Group,
  type Media,
  type Playlist,
  type Program,
  type User,
} from "../shared/domain.ts";
import {
  AppError,
  audit,
  auditList,
  createRecord,
  fail,
  getRecord,
  listRecords,
  lockWorkspace,
  putRecord,
  requireRecord,
  saveRecord,
  type Database,
} from "./db.ts";
import {
  allow,
  canAccessDevice,
  createSession,
  currentUser,
  digest,
  passwordHash,
  passwordMatches,
  requireDevices,
} from "./auth.ts";
import {
  claim,
  complete,
  enqueue,
  getJob,
  listJobs,
  transitionJob,
} from "./jobs.ts";
import {
  collectMediaIds,
  createTrainingDevice,
  initializeTraining,
} from "./training.ts";

export interface AppOptions {
  db: Database;
  dataDir: string;
  workerToken: string;
  publicOrigin?: string;
  secureCookies?: boolean;
  distDir?: string;
  logger?: boolean;
  shutdown?: () => Promise<void>;
}
export async function buildApp(options: AppOptions) {
  const { db, dataDir, workerToken } = options;
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 4 * 1024 * 1024,
    trustProxy: false,
  });
  const uploadDir = path.join(dataDir, "uploads");
  await mkdir(uploadDir, { recursive: true });
  await app.register(cookie);
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(multipart, {
    limits: { fileSize: 512 * 1024 * 1024, files: 1, fields: 4 },
  });
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("X-Frame-Options", "DENY");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    const route = req.routeOptions.url ?? req.url;
    if (route.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    if (
      route.startsWith("/api/") &&
      !route.startsWith("/api/internal/") &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method)
    ) {
      if (req.headers["x-fleet-request"] !== "1")
        fail(403, "CSRF", "Missing request protection.");
      const expected =
        options.publicOrigin ?? `${req.protocol}://${req.headers.host}`;
      if (req.headers.origin && req.headers.origin !== expected)
        fail(403, "ORIGIN", "Request origin is not permitted.");
    }
    if (route.startsWith("/api/internal/")) {
      const actual = Buffer.from(
          String(req.headers.authorization ?? "").replace(/^Bearer /, ""),
        ),
        expected = Buffer.from(workerToken);
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        fail(401, "WORKER_AUTH", "Worker authentication required.");
    }
  });
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof AppError)
      return reply
        .code(error.status)
        .send({ error: error.message, code: error.code });
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
        code: "VALIDATION",
      });
    const err = error as {
      statusCode?: number;
      code?: string;
      message?: string;
    };
    if (err.statusCode && err.statusCode < 500)
      return reply
        .code(err.statusCode)
        .send({ error: err.message, code: err.code });
    app.log.error(error);
    return reply.code(500).send({
      error:
        "The operation failed. Nothing should be assumed complete; check Activity.",
      code: "SERVER_ERROR",
    });
  });
  const setSession = (reply: FastifyReply, token: string) =>
    reply.setCookie("fleet_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: options.secureCookies ?? false,
      path: "/",
      maxAge: 43200,
    });
  const loginInput = z.object({
    email: z
      .email()
      .max(200)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(12).max(200),
  });
  app.get("/api/health", async () => ({
    ok: true,
    service: "fleet-control",
    version: "0.1.0",
  }));
  app.get("/api/session", async (req) => {
    const initialized =
      (await db.query("SELECT id FROM users LIMIT 1")).rows.length > 0;
    try {
      return { initialized, user: await currentUser(db, req) };
    } catch {
      return { initialized, user: null };
    }
  });
  app.post(
    "/api/setup",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (req, reply) => {
      const data = loginInput.extend({ name: nameSchema }).parse(req.body);
      const user = await db.transaction(async (tx) => {
        await lockWorkspace(tx);
        if ((await tx.query("SELECT id FROM users LIMIT 1")).rows.length)
          fail(409, "ALREADY_SETUP", "The workspace already has an owner.");
        const id = randomUUID();
        await tx.query(
          "INSERT INTO users(id,email,name,role,password_hash) VALUES($1,$2,$3,'owner',$4)",
          [id, data.email, data.name, passwordHash(data.password)],
        );
        await audit(tx, id, "workspace.created", "primary");
        return {
          id,
          email: data.email,
          name: data.name,
          role: "owner" as const,
          groupIds: [],
        };
      });
      setSession(reply, await createSession(db, user.id));
      return { user };
    },
  );
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (req, reply) => {
      const data = loginInput.parse(req.body);
      const user = (
        await db.query<User & { password_hash: string }>(
          'SELECT id,email,name,role,group_ids AS "groupIds",password_hash FROM users WHERE email=$1 AND disabled=false',
          [data.email],
        )
      ).rows[0];
      if (!user || !passwordMatches(data.password, user.password_hash))
        fail(401, "INVALID_LOGIN", "Email or password is incorrect.");
      setSession(reply, await createSession(db, user.id));
      const { password_hash: _, ...safe } = user;
      return { user: safe };
    },
  );
  app.post("/api/logout", async (req, reply) => {
    if (req.cookies.fleet_session)
      await db.query("DELETE FROM sessions WHERE token_hash=$1", [
        digest(req.cookies.fleet_session),
      ]);
    reply.clearCookie("fleet_session", { path: "/" });
    return { ok: true };
  });
  app.get("/api/state", async (req) => {
    const user = await currentUser(db, req),
      groups = await listRecords<Group>(db, "group");
    const devices = (await listRecords<Device>(db, "device")).filter((d) =>
      canAccessDevice(user, d, groups),
    );
    const visible = new Set(devices.map((d) => d.id));
    const jobs = (await listJobs(db)).filter(
      (j) =>
        user.role === "owner" ||
        j.requestedBy === user.id ||
        (j.targetIds.length > 0 && j.targetIds.every((id) => visible.has(id))),
    );
    const connection = await requireRecord<Connection>(
      db,
      "connection",
      "primary",
    );
    return {
      user,
      groups,
      devices,
      programs: await listRecords<Program>(db, "program"),
      publishedPrograms: await listRecords<Program>(db, "published-program"),
      media: await listRecords<Media>(db, "media"),
      playlists: await listRecords<Playlist>(db, "playlist"),
      jobs,
      audit: user.role === "owner" ? await auditList(db) : [],
      connection: {
        ...connection,
        allowedDeviceIds: connection.allowedDeviceIds.filter((id) =>
          visible.has(id),
        ),
      },
    };
  });
  app.post("/api/training", async (req) => {
    const user = await currentUser(db, req);
    allow(user, ["owner"]);
    const data = z
      .object({
        count: z.number().int().min(1).max(500).default(6),
        confirm: z.literal("TRAINING"),
      })
      .parse(req.body);
    await db.transaction(async (tx) => {
      await lockWorkspace(tx);
      if ((await listRecords(tx, "device")).length)
        fail(
          409,
          "NOT_EMPTY",
          "Training can only initialize an empty workspace.",
        );
      await initializeTraining(tx, user.id, data.count);
    });
    return { ok: true };
  });
  app.post("/api/training/devices", async (req) => {
    const user = await currentUser(db, req);
    allow(user, ["owner", "operator"]);
    const data = z
      .object({
        name: nameSchema,
        groupId: idSchema.nullable(),
        width: z.number().int().min(64).max(16384),
        height: z.number().int().min(64).max(16384),
      })
      .parse(req.body);
    return db.transaction(async (tx) => {
      await lockWorkspace(tx);
      if (
        (await requireRecord<Connection>(tx, "connection", "primary")).mode !==
        "training"
      )
        fail(409, "NOT_TRAINING", "This action only adds a simulated player.");
      if (data.groupId) await requireRecord(tx, "group", data.groupId);
      const d = await createTrainingDevice(
        tx,
        data.name,
        data.groupId,
        data.width,
        data.height,
      );
      requireDevices(user, [d], await listRecords<Group>(tx, "group"));
      await audit(tx, user.id, "training.device_added", d.id);
      return d;
    });
  });
  app.patch("/api/connection", async (req) => {
    const user = await currentUser(db, req);
    allow(user, ["owner"]);
    const data = z
      .object({
        paused: z.boolean().optional(),
        maxTargets: z.number().int().min(1).max(500).optional(),
        requirePublishApproval: z.boolean().optional(),
        allowedDeviceIds: z.array(idSchema).max(500).optional(),
      })
      .strict()
      .parse(req.body);
    return db.transaction(async (tx) => {
      await lockWorkspace(tx);
      const c = await requireRecord<Connection>(tx, "connection", "primary");
      if (data.allowedDeviceIds)
        for (const id of data.allowedDeviceIds)
          await requireRecord(tx, "device", id);
      const next = {
        ...c,
        ...data,
        consecutiveFailures: data.paused === false ? 0 : c.consecutiveFailures,
      };
      await putRecord(tx, "connection", "primary", next);
      await audit(tx, user.id, "connection.updated", "primary", data);
      return next;
    });
  });
  app.post("/api/programs", async (req) => {
    const user = await currentUser(db, req);
    allow(user, ["owner", "editor"]);
    const input = programInputSchema.parse(req.body);
    return db.transaction(async (tx) => {
      const p: Program = {
        ...input,
        id: randomUUID(),
        version: 1,
        status: "draft",
        updatedAt: new Date().toISOString(),
      };
      for (const id of collectMediaIds(p)) await requireRecord(tx, "media", id);
      await createRecord(tx, "program", p);
      await createRecord(tx, "revision", {
        ...p,
        id: p.id + "-1",
        programId: p.id,
      });
      await audit(tx, user.id, "program.created", p.id);
      return p;
    });
  });
  app.put<{ Params: { id: string } }>("/api/programs/:id", async (req) => {
    const user = await currentUser(db, req);
    allow(user, ["owner", "editor"]);
    const input = programInputSchema
      .safeExtend({ version: z.number().int().min(1) })
      .parse(req.body);
    return db.transaction(async (tx) => {
      const old = await requireRecord<Program>(
        tx,
        "program",
        idSchema.parse(req.params.id),
      );
      if (old.deletedAt)
        fail(410, "DELETED", "Restore this program before editing.");
      for (const id of collectMediaIds(input as Program))
        await requireRecord(tx, "media", id);
      const p = await saveRecord(tx, "program", {
        ...old,
        ...input,
        status: "draft" as const,
        updatedAt: new Date().toISOString(),
      });
      await createRecord(tx, "revision", {
        ...p,
        id: p.id + "-" + p.version,
        programId: p.id,
      });
      await audit(tx, user.id, "program.saved", p.id, { version: p.version });
      return p;
    });
  });
  app.post<{ Params: { id: string } }>(
    "/api/programs/:id/clear",
    async (req) => {
      const user = await currentUser(db, req);
      allow(user, ["owner", "editor"]);
      const input = z
        .object({ version: z.number().int(), confirm: z.literal("CLEAR") })
        .parse(req.body);
      return db.transaction(async (tx) => {
        const old = await requireRecord<Program>(
          tx,
          "program",
          idSchema.parse(req.params.id),
        );
        if (old.deletedAt) fail(410, "DELETED", "Restore this program first.");
        const p = await saveRecord(
          tx,
          "program",
          {
            ...old,
            status: "draft" as const,
            screens: old.screens.map((s) => ({ ...s, layers: [] })),
            updatedAt: new Date().toISOString(),
          },
          input.version,
        );
        await createRecord(tx, "revision", {
          ...p,
          id: p.id + "-" + p.version,
          programId: p.id,
        });
        await audit(tx, user.id, "program.cleared", p.id, {
          version: p.version,
          libraryMediaPreserved: true,
          devicesUnchanged: true,
        });
        return p;
      });
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/programs/:id/action",
    async (req) => {
      const user = await currentUser(db, req);
      const input = z
        .object({
          action: z.enum([
            "submit",
            "approve",
            "reject",
            "archive",
            "restore",
            "duplicate",
            "restore_revision",
          ]),
          version: z.number().int(),
          revisionId: idSchema.optional(),
        })
        .parse(req.body);
      allow(
        user,
        input.action === "approve" || input.action === "reject"
          ? ["owner", "reviewer"]
          : ["owner", "editor"],
      );
      return db.transaction(async (tx) => {
        const old = await requireRecord<Program>(
          tx,
          "program",
          idSchema.parse(req.params.id),
        );
        if (old.version !== input.version)
          fail(
            409,
            "VERSION_CONFLICT",
            "Program changed. Refresh before proceeding.",
          );
        let next = { ...old, updatedAt: new Date().toISOString() };
        if (input.action === "duplicate") {
          next = {
            ...next,
            id: randomUUID(),
            name: old.name.slice(0, 110) + " copy",
            version: 1,
            status: "draft",
            externalId: undefined,
            deletedAt: undefined,
            lastPublishedVersion: undefined,
          };
          await createRecord(tx, "program", next);
        } else {
          if (input.action === "submit") {
            next.status = "submitted";
            next.submittedVersion = old.version;
          }
          if (input.action === "approve") {
            if (old.status !== "submitted")
              fail(409, "NOT_SUBMITTED", "Submit this draft before approval.");
            next.status = "approved";
          }
          if (input.action === "reject") next.status = "draft";
          if (input.action === "archive") {
            const bound = (await listRecords<Playlist>(tx, "playlist")).filter(
              (p) => p.programIds.includes(old.id),
            );
            if (bound.length)
              fail(
                409,
                "IN_PLAYLIST",
                "Remove this program from playlists before archiving it.",
              );
            next.deletedAt = new Date().toISOString();
          }
          if (input.action === "restore") next.deletedAt = undefined;
          if (input.action === "restore_revision") {
            const revision = await requireRecord<
              Program & { programId: string }
            >(tx, "revision", idSchema.parse(input.revisionId));
            if (revision.programId !== old.id)
              fail(
                400,
                "WRONG_PROGRAM",
                "Revision belongs to another program.",
              );
            next = {
              ...next,
              screens: revision.screens,
              schedule: revision.schedule,
              tags: revision.tags,
              name: revision.name,
              type: revision.type,
              status: "draft",
            };
          }
          next = await saveRecord(tx, "program", next);
        }
        await createRecord(tx, "revision", {
          ...next,
          id: next.id + "-" + next.version,
          programId: next.id,
        });
        await audit(tx, user.id, `program.${input.action}`, old.id, {
          version: next.version,
        });
        return next;
      });
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/programs/:id/revisions",
    async (req) => {
      await currentUser(db, req);
      const id = idSchema.parse(req.params.id);
      return (
        await db.query<{ body: unknown }>(
          "SELECT body FROM records WHERE kind='revision' AND body->>'programId'=$1 ORDER BY updated_at DESC",
          [id],
        )
      ).rows.map((r) => r.body);
    },
  );
  app.post("/api/media", async (req) => {
    const user = await currentUser(db, req);
    allow(user, ["owner", "editor"]);
    const part = await req.file();
    if (!part) return fail(400, "NO_FILE", "Choose a file.");
    const id = randomUUID(),
      temporary = path.join(uploadDir, id + ".partial"),
      destination = path.join(uploadDir, id);
    const hash = createHash("sha256");
    let size = 0;
    try {
      await pipeline(
        part.file,
        new Transform({
          transform(chunk: Buffer, _encoding, done) {
            size += chunk.length;
            hash.update(chunk);
            done(null, chunk);
          },
        }),
        createWriteStream(temporary, { flags: "wx" }),
      );
      if (part.file.truncated)
        fail(413, "FILE_TOO_LARGE", "Each file must be 512 MB or smaller.");
      const file = await open(temporary, "r");
      const magic = Buffer.alloc(64);
      try {
        await file.read(magic, 0, 64, 0);
      } finally {
        await file.close();
      }
      const detected = detectMedia(magic);
      if (!detected)
        return fail(
          415,
          "UNSUPPORTED_FILE",
          "Supported files: JPEG, PNG, GIF, WebP, MP4/MOV, WebM, MP3, WAV and PDF.",
        );
      const checksum = hash.digest("hex");
      const existing = (await listRecords<Media>(db, "media")).find(
        (m) => m.checksum === checksum,
      );
      if (existing) {
        await rm(temporary);
        return { media: existing, duplicate: true };
      }
      const filename =
        path.basename(part.filename.replaceAll("\\", "/")).slice(0, 200) ||
        "Untitled";
      const media: Media = {
        id,
        name: filename,
        ...detected,
        size,
        checksum,
        width: null,
        height: null,
        duration: null,
        group: "",
        review: "pending",
        createdAt: new Date().toISOString(),
        version: 1,
      };
      await rename(temporary, destination);
      await db.transaction(async (tx) => {
        await createRecord(tx, "media", media);
        await audit(tx, user.id, "media.uploaded", id, {
          name: filename,
          size,
          checksum,
        });
      });
      return { media, duplicate: false };
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  });
  app.get<{ Params: { id: string } }>(
    "/api/media/:id/file",
    async (req, reply) => {
      await currentUser(db, req);
      const m = await requireRecord<Media>(
        db,
        "media",
        idSchema.parse(req.params.id),
      );
      const file = path.join(uploadDir, m.id);
      const fileInfo = await stat(file);
      reply
        .type(m.mime)
        .header("Accept-Ranges", "bytes")
        .header(
          "Content-Disposition",
          `${m.type === "document" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(m.name)}`,
        );
      const range = req.headers.range;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2]))
          return reply
            .code(416)
            .header("Content-Range", `bytes */${fileInfo.size}`)
            .send();
        const start = match[1]
          ? Number(match[1])
          : Math.max(0, fileInfo.size - Number(match[2]));
        const end =
          match[1] && match[2]
            ? Math.min(Number(match[2]), fileInfo.size - 1)
            : fileInfo.size - 1;
        if (start > end || start >= fileInfo.size)
          return reply
            .code(416)
            .header("Content-Range", `bytes */${fileInfo.size}`)
            .send();
        return reply
          .code(206)
          .header("Content-Range", `bytes ${start}-${end}/${fileInfo.size}`)
          .header("Content-Length", end - start + 1)
          .send(createReadStream(file, { start, end }));
      }
      return reply
        .header("Content-Length", fileInfo.size)
        .send(createReadStream(file));
    },
  );
  app.patch<{ Params: { id: string } }>("/api/media/:id", async (req) => {
    const user = await currentUser(db, req);
    const input = z
      .object({
        version: z.number().int(),
        name: z.string().trim().min(1).max(200).optional(),
        group: z.string().max(120).optional(),
        review: z.enum(["pending", "approved", "rejected"]).optional(),
        width: z.number().int().min(1).max(32768).optional(),
        height: z.number().int().min(1).max(32768).optional(),
        duration: z.number().positive().max(864000).optional(),
      })
      .parse(req.body);
    allow(user, input.review ? ["owner", "reviewer"] : ["owner", "editor"]);
    return db.transaction(async (tx) => {
      const old = await requireRecord<Media>(
        tx,
        "media",
        idSchema.parse(req.params.id),
      );
      const next = await saveRecord(tx, "media", { ...old, ...input });
      await audit(tx, user.id, "media.updated", old.id, input);
      return next;
    });
  });
  app.delete<{ Params: { id: string } }>("/api/media/:id", async (req) => {
    const user = await currentUser(db, req);
    allow(user, ["owner", "editor"]);
    const id = idSchema.parse(req.params.id);
    await db.transaction(async (tx) => {
      await lockWorkspace(tx);
      await requireRecord(tx, "media", id);
      const used = (await listRecords<Program>(tx, "program")).some((p) =>
        collectMediaIds(p).includes(id),
      );
      const revisions = (await listRecords<Program>(tx, "revision")).some((p) =>
        collectMediaIds(p).includes(id),
      );
      const queued = (await listJobs(tx, 10000)).some(
        (j) =>
          !["failed", "cancelled"].includes(j.state) &&
          JSON.stringify(j.payload).includes(id),
      );
      if (used || revisions || queued)
        fail(
          409,
          "MEDIA_IN_USE",
          "This file is referenced by a program, saved revision or publish history. Keep it so that recovery remains possible.",
        );
      await tx.query("DELETE FROM records WHERE kind='media' AND id=$1", [id]);
      await audit(tx, user.id, "media.deleted", id);
    });
    // Retain bytes in a recoverable archive; they are no longer served by this API.
    await mkdir(path.join(dataDir, "trash"), { recursive: true });
    await rename(path.join(uploadDir, id), path.join(dataDir, "trash", id));
    return { ok: true, recoverable: true };
  });
  app.post("/api/playlists", async (req) => {
    const user = await currentUser(db, req);
    allow(user, ["owner", "editor"]);
    const input = z
      .object({
        name: nameSchema,
        programIds: z.array(idSchema).max(100),
        deviceIds: z.array(idSchema).max(500),
      })
      .parse(req.body);
    return db.transaction(async (tx) => {
      for (const id of input.programIds) {
        const p = await requireRecord<Program>(tx, "program", id);
        if (p.deletedAt)
          fail(400, "ARCHIVED_PROGRAM", "Archived programs cannot be added.");
      }
      const devices = await Promise.all(
        input.deviceIds.map((id) => requireRecord<Device>(tx, "device", id)),
      );
      requireDevices(user, devices, await listRecords<Group>(tx, "group"));
      const p: Playlist = { ...input, id: randomUUID(), version: 1 };
      await createRecord(tx, "playlist", p);
      await audit(tx, user.id, "playlist.created", p.id);
      return p;
    });
  });
  app.put<{ Params: { id: string } }>("/api/playlists/:id", async (req) => {
    const user = await currentUser(db, req);
    allow(user, ["owner", "editor"]);
    const input = z
      .object({
        name: nameSchema,
        version: z.number().int(),
        programIds: z.array(idSchema).max(100),
        deviceIds: z.array(idSchema).max(500),
      })
      .parse(req.body);
    return db.transaction(async (tx) => {
      const old = await requireRecord<Playlist>(
        tx,
        "playlist",
        idSchema.parse(req.params.id),
      );
      for (const id of input.programIds) {
        const p = await requireRecord<Program>(tx, "program", id);
        if (p.deletedAt)
          fail(400, "ARCHIVED_PROGRAM", "Archived programs cannot be added.");
      }
      requireDevices(
        user,
        await Promise.all(
          input.deviceIds.map((id) => requireRecord<Device>(tx, "device", id)),
        ),
        await listRecords<Group>(tx, "group"),
      );
      const p = await saveRecord(tx, "playlist", { ...old, ...input });
      await audit(tx, user.id, "playlist.saved", p.id);
      return p;
    });
  });
  app.delete<{ Params: { id: string } }>("/api/playlists/:id", async (req) => {
    const user = await currentUser(db, req);
    allow(user, ["owner", "editor"]);
    await db.transaction(async (tx) => {
      await tx.query("DELETE FROM records WHERE kind='playlist' AND id=$1", [
        idSchema.parse(req.params.id),
      ]);
      await audit(tx, user.id, "playlist.deleted", req.params.id);
    });
    return { ok: true };
  });
  app.post("/api/jobs", async (req) =>
    enqueue(db, await currentUser(db, req), req.body),
  );
  app.post<{ Params: { id: string } }>("/api/jobs/:id/action", async (req) => {
    const user = await currentUser(db, req);
    const data = z
      .object({ action: z.enum(["approve", "cancel"]) })
      .parse(req.body);
    return transitionJob(db, user, idSchema.parse(req.params.id), data.action);
  });
  app.get<{ Params: { id: string } }>("/api/jobs/:id/events", async (req) => {
    const user = await currentUser(db, req);
    const j = await getJob(db, idSchema.parse(req.params.id));
    if (user.role !== "owner" && user.id !== j.requestedBy)
      requireDevices(
        user,
        await Promise.all(
          j.targetIds.map((id) => requireRecord<Device>(db, "device", id)),
        ),
        await listRecords<Group>(db, "group"),
      );
    return (
      await db.query(
        'SELECT step,detail,created_at AS "createdAt" FROM job_events WHERE job_id=$1 ORDER BY created_at',
        [j.id],
      )
    ).rows;
  });
  app.get("/api/users", async (req) => {
    allow(await currentUser(db, req), ["owner"]);
    return (
      await db.query<User>(
        'SELECT id,email,name,role,group_ids AS "groupIds",disabled FROM users ORDER BY name',
      )
    ).rows;
  });
  app.post("/api/users", async (req) => {
    const owner = await currentUser(db, req);
    allow(owner, ["owner"]);
    const input = loginInput
      .extend({
        name: nameSchema,
        role: z.enum(roles),
        groupIds: z.array(idSchema).max(100),
      })
      .parse(req.body);
    return db.transaction(async (tx) => {
      if (
        (await tx.query("SELECT id FROM users WHERE email=$1", [input.email]))
          .rows.length
      )
        fail(409, "DUPLICATE_EMAIL", "This email is already registered.");
      for (const id of input.groupIds) await requireRecord(tx, "group", id);
      const id = randomUUID();
      await tx.query(
        "INSERT INTO users(id,email,name,role,group_ids,password_hash) VALUES($1,$2,$3,$4,$5,$6)",
        [
          id,
          input.email,
          input.name,
          input.role,
          JSON.stringify(input.groupIds),
          passwordHash(input.password),
        ],
      );
      await audit(tx, owner.id, "user.created", id, {
        role: input.role,
        groupIds: input.groupIds,
      });
      return { id };
    });
  });
  app.patch<{ Params: { id: string } }>("/api/users/:id", async (req) => {
    const owner = await currentUser(db, req);
    allow(owner, ["owner"]);
    const input = z.object({ disabled: z.boolean() }).parse(req.body);
    if (req.params.id === owner.id)
      fail(400, "SELF_DISABLE", "You cannot disable your own account.");
    await db.transaction(async (tx) => {
      await tx.query("UPDATE users SET disabled=$2 WHERE id=$1", [
        idSchema.parse(req.params.id),
        input.disabled,
      ]);
      await tx.query("DELETE FROM sessions WHERE user_id=$1", [req.params.id]);
      await audit(tx, owner.id, "user.access_changed", req.params.id, input);
    });
    return { ok: true };
  });
  app.get("/api/export", async (req, reply) => {
    const user = await currentUser(db, req);
    allow(user, ["owner"]);
    reply.header(
      "Content-Disposition",
      'attachment; filename="fleet-workspace-export.json"',
    );
    await audit(db, user.id, "workspace.exported", "primary");
    return {
      format: "fleet-workspace-v1",
      exportedAt: new Date().toISOString(),
      records: (
        await db.query(
          "SELECT kind,id,body FROM records WHERE kind NOT IN ('connection','training-device','training-group')",
        )
      ).rows,
      jobs: await listJobs(db, 10000),
      audit: await auditList(db, 10000),
      note: "This is a data export, not a full backup. Media bytes, users and credentials are excluded.",
    };
  });
  app.post("/api/internal/claim", async (req) =>
    claim(db, z.object({ workerId: idSchema }).parse(req.body).workerId),
  );
  if (options.shutdown)
    app.post("/api/internal/shutdown", async (_req, reply) => {
      reply.send({ ok: true });
      setTimeout(() => {
        void options.shutdown!();
      }, 100);
    });
  app.post("/api/internal/connect", async (req) => {
    const input = z
      .object({
        account: z.string().min(1).max(200),
        capabilities: z.array(z.enum(commands)),
        devices: z
          .array(
            z.object({
              id: idSchema,
              externalId: idSchema,
              name: nameSchema,
              groupId: idSchema.nullable(),
              online: z.boolean().nullable(),
              capabilities: z.array(z.string().max(80)),
              version: z.number().int(),
              lastSeenAt: z.string().nullable(),
              settings: z.object({
                brightness: z.number().min(0).max(100).nullable(),
                volume: z.number().min(0).max(100).nullable(),
                rotation: z.number().min(0).max(359).nullable(),
                power: z.enum(["on", "off", "unknown"]),
                width: z.number().int().min(0).max(16384),
                height: z.number().int().min(0).max(16384),
                programId: z.string().nullable(),
                programName: z.string().nullable(),
                powerSchedule: powerScheduleSchema.nullable(),
                firmware: z.string().nullable().optional(),
                timezone: z.string().nullable(),
                observedAt: z.string().datetime().nullable(),
                source: z.literal("xiaohui-cloud-ui"),
              }),
            }),
          )
          .max(500),
        groups: z
          .array(
            z.object({
              id: idSchema,
              name: nameSchema,
              parentId: idSchema.nullable(),
              externalId: z.string().max(150).optional(),
              version: z.number().int(),
            }),
          )
          .max(1000),
      })
      .parse(req.body);
    return db.transaction(async (tx) => {
      await lockWorkspace(tx);
      const c = await requireRecord<Connection>(tx, "connection", "primary");
      if (
        !(
          await tx.query(
            "SELECT id FROM users WHERE role=$1 AND disabled=false LIMIT 1",
            ["owner"],
          )
        ).rows.length
      )
        fail(
          409,
          "SETUP_REQUIRED",
          "Create the workspace owner before connecting.",
        );
      if (c.mode === "training")
        fail(
          409,
          "TRAINING_WORKSPACE",
          "Use a separate clean workspace for the live connection.",
        );
      if (c.verifiedAccount && c.verifiedAccount !== input.account)
        fail(
          409,
          "ACCOUNT_CHANGED",
          "A different cloud account requires a separate workspace.",
        );
      if (
        input.devices.some((d) => d.externalId.startsWith("TRAIN-")) ||
        new Set(input.devices.map((d) => d.externalId)).size !==
          input.devices.length
      )
        fail(
          400,
          "INVALID_FLEET",
          "Duplicate or simulated device IDs are not permitted.",
        );
      for (const g of input.groups) await putRecord(tx, "group", g.id, g);
      for (const d of input.devices) {
        if (d.groupId && !input.groups.some((g) => g.id === d.groupId))
          fail(400, "MISSING_GROUP", "A device group is missing.");
        await putRecord(tx, "device", d.id, d);
      }
      await putRecord(tx, "connection", "primary", {
        ...c,
        mode: "xiaohui",
        accountLabel: input.account,
        verifiedAccount: input.account,
        capabilities: input.capabilities,
        allowedDeviceIds: c.allowedDeviceIds.filter((id) =>
          input.devices.some((d) => d.id === id),
        ),
        lastSyncAt: new Date().toISOString(),
        lastError: null,
        consecutiveFailures: 0,
      });
      await audit(tx, "local-connector", "connection.commissioned", "primary", {
        account: input.account,
        devices: input.devices.length,
        capabilities: input.capabilities,
      });
      return {
        ok: true,
        imported: input.devices.length,
        note: "Select the permitted test screens in Settings before any write.",
      };
    });
  });
  app.post<{ Params: { id: string } }>(
    "/api/internal/jobs/:id/heartbeat",
    async (req) => {
      const input = z
        .object({
          workerId: idSchema,
          step: z.string().max(100).optional(),
          detail: z.string().max(1000).optional(),
        })
        .parse(req.body);
      const result = await db.query(
        "UPDATE jobs SET lease_until=now()+interval '90 seconds',state=CASE WHEN $3='verifying' THEN 'verifying' ELSE state END,updated_at=now() WHERE id=$1 AND worker_id=$2 AND state IN ('running','verifying') AND lease_until>now() RETURNING id",
        [idSchema.parse(req.params.id), input.workerId, input.step],
      );
      if (!result.rows.length)
        fail(409, "LEASE_LOST", "Worker lease was lost.");
      if (input.step)
        await db.query(
          "INSERT INTO job_events(id,job_id,step,detail) VALUES($1,$2,$3,$4)",
          [randomUUID(), req.params.id, input.step, input.detail ?? ""],
        );
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/internal/jobs/:id/complete",
    async (req) => {
      const input = z
        .object({ workerId: idSchema, output: z.unknown() })
        .parse(req.body);
      return complete(
        db,
        idSchema.parse(req.params.id),
        input.workerId,
        input.output,
      );
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/internal/media/:id",
    async (req, reply) => {
      const m = await requireRecord<Media>(
        db,
        "media",
        idSchema.parse(req.params.id),
      );
      return reply
        .type(m.mime)
        .send(createReadStream(path.join(uploadDir, m.id)));
    },
  );
  const dist = options.distDir;
  if (dist && existsSync(dist)) {
    await app.register(staticFiles, { root: dist });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({ error: "Not found." })
        : reply.sendFile("index.html"),
    );
  }
  return app;
}
function detectMedia(b: Buffer): { type: Media["type"]; mime: string } | null {
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { type: "image", mime: "image/png" };
  if (b[0] === 255 && b[1] === 216 && b[2] === 255)
    return { type: "image", mime: "image/jpeg" };
  if (b.toString("ascii", 0, 6).startsWith("GIF8"))
    return { type: "image", mime: "image/gif" };
  if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return { type: "image", mime: "image/webp" };
  if (b.toString("ascii", 4, 8) === "ftyp")
    return { type: "video", mime: "video/mp4" };
  if (b.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])))
    return { type: "video", mime: "video/webm" };
  if (
    b.toString("ascii", 0, 3) === "ID3" ||
    (b[0] === 255 && (b[1] & 224) === 224)
  )
    return { type: "audio", mime: "audio/mpeg" };
  if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WAVE"
  )
    return { type: "audio", mime: "audio/wav" };
  if (b.toString("ascii", 0, 5) === "%PDF-")
    return { type: "document", mime: "application/pdf" };
  return null;
}
