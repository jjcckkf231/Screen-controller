import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Audit, Connection } from "../shared/domain.ts";

export interface Sql {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export interface Database extends Sql {
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export async function openDatabase(
  dataDir: string,
  url?: string,
): Promise<Database> {
  await mkdir(dataDir, { recursive: true });
  let db: Database;
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: 5 });
    const adapter = (client: pg.Pool | pg.PoolClient): Sql => ({
      query: async <T>(sql: string, params: unknown[] = []) => ({
        rows: (await client.query(sql, params)).rows as T[],
      }),
    });
    db = {
      ...adapter(pool),
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const sql = adapter(client);
          await lockWorkspace(sql);
          const v = await fn(sql);
          await client.query("COMMIT");
          return v;
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  } else {
    const embedded = await PGlite.create(path.join(dataDir, "postgres"));
    db = {
      query: async <T>(sql: string, params: unknown[] = []) => ({
        rows: (await embedded.query<T>(sql, params)).rows,
      }),
      transaction: (fn) =>
        embedded.transaction(async (tx) => {
          const sql: Sql = {
            query: async <T>(sql: string, params: unknown[] = []) => ({
              rows: (await tx.query<T>(sql, params)).rows,
            }),
          };
          await lockWorkspace(sql);
          return fn(sql);
        }),
      close: () => embedded.close(),
    };
  }
  for (const statement of schema) await db.query(statement);
  await db.query(
    "INSERT INTO records(kind,id,version,body) VALUES('connection','primary',1,$1) ON CONFLICT DO NOTHING",
    [JSON.stringify(defaultConnection)],
  );
  return db;
}
const schema = [
  `CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL, id TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, body JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(kind,id))`,
  `CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, group_ids JSONB NOT NULL DEFAULT '[]', password_hash TEXT NOT NULL, disabled BOOLEAN NOT NULL DEFAULT false)`,
  `CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TIMESTAMPTZ NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, details JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, command TEXT NOT NULL, state TEXT NOT NULL, payload JSONB NOT NULL, target_ids JSONB NOT NULL, results JSONB NOT NULL DEFAULT '[]', error TEXT, requested_by TEXT NOT NULL, approved_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), idempotency_key TEXT UNIQUE NOT NULL, request_hash TEXT NOT NULL, mode TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, worker_id TEXT, lease_until TIMESTAMPTZ)`,
  `CREATE INDEX IF NOT EXISTS jobs_queue_idx ON jobs(state,created_at)`,
  `CREATE TABLE IF NOT EXISTS job_events(id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), step TEXT NOT NULL, detail TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS audit_time_idx ON audit(created_at DESC)`,
];
export const defaultConnection: Connection = {
  mode: "disconnected",
  paused: false,
  accountLabel: "",
  verifiedAccount: null,
  allowedDeviceIds: [],
  maxTargets: 5,
  requirePublishApproval: false,
  capabilities: [],
  lastSyncAt: null,
  lastError: null,
  consecutiveFailures: 0,
  workerLastSeenAt: null,
};
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const fail = (status: number, code: string, message: string): never => {
  throw new AppError(status, code, message);
};
export async function listRecords<T>(db: Sql, kind: string): Promise<T[]> {
  const q = await db.query<{ body: T }>(
    "SELECT body FROM records WHERE kind=$1 ORDER BY updated_at DESC,id",
    [kind],
  );
  return q.rows.map((r) => r.body);
}
export async function getRecord<T>(
  db: Sql,
  kind: string,
  id: string,
): Promise<T | null> {
  return (
    (
      await db.query<{ body: T }>(
        "SELECT body FROM records WHERE kind=$1 AND id=$2",
        [kind, id],
      )
    ).rows[0]?.body ?? null
  );
}
export async function requireRecord<T>(
  db: Sql,
  kind: string,
  id: string,
): Promise<T> {
  const r = await getRecord<T>(db, kind, id);
  if (!r) fail(404, "NOT_FOUND", `${kind} not found`);
  return r!;
}
export async function createRecord<T extends { id: string; version?: number }>(
  db: Sql,
  kind: string,
  body: T,
): Promise<T> {
  const next = kind === "revision" ? { ...body } : { ...body, version: 1 };
  await db.query(
    "INSERT INTO records(kind,id,version,body) VALUES($1,$2,1,$3)",
    [kind, body.id, JSON.stringify(next)],
  );
  return next;
}
export async function saveRecord<T extends { id: string; version: number }>(
  db: Sql,
  kind: string,
  body: T,
  expected = body.version,
): Promise<T> {
  const next = { ...body, version: expected + 1 };
  const r = await db.query(
    "UPDATE records SET body=$1,version=version+1,updated_at=now() WHERE kind=$2 AND id=$3 AND version=$4 RETURNING id",
    [JSON.stringify(next), kind, body.id, expected],
  );
  if (!r.rows.length)
    fail(409, "VERSION_CONFLICT", "This item changed. Refresh before saving.");
  return next;
}
export async function putRecord(
  db: Sql,
  kind: string,
  id: string,
  body: unknown,
) {
  await db.query(
    `INSERT INTO records(kind,id,version,body) VALUES($1,$2,1,CASE WHEN $3::jsonb ? 'version' THEN jsonb_set($3::jsonb,'{version}','1') ELSE $3::jsonb END) ON CONFLICT(kind,id) DO UPDATE SET body=CASE WHEN EXCLUDED.body ? 'version' THEN jsonb_set(EXCLUDED.body,'{version}',to_jsonb(records.version+1)) ELSE EXCLUDED.body END,version=records.version+1,updated_at=now()`,
    [kind, id, JSON.stringify(body)],
  );
}
export async function audit(
  db: Sql,
  actor: string,
  action: string,
  target: string,
  details: Record<string, unknown> = {},
) {
  await db.query(
    "INSERT INTO audit(id,actor,action,target,details) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), actor, action, target, JSON.stringify(details)],
  );
}
export async function auditList(db: Sql, limit = 100): Promise<Audit[]> {
  return (
    await db.query<Audit>(
      'SELECT id,actor,action,target,details,created_at AS "createdAt" FROM audit ORDER BY created_at DESC LIMIT $1',
      [limit],
    )
  ).rows;
}
export async function lockWorkspace(db: Sql) {
  await db.query(
    "SELECT id FROM records WHERE kind='connection' AND id='primary' FOR UPDATE",
  );
}
