import { cp, mkdir, writeFile, stat, readFile } from "node:fs/promises";
import path from "node:path";
import { processAlive } from "../server/lock.ts";
try {
  process.loadEnvFile();
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
if (process.env.DATABASE_URL)
  throw new Error(
    "External PostgreSQL requires pg_dump plus an upload/secret archive. See docs/OPERATIONS.md. This command only backs up a stopped local embedded database.",
  );
const source = path.resolve(process.env.FLEET_DATA_DIR ?? ".data"),
  port = process.env.PORT ?? "4178";
let running = false;
try {
  const lock = JSON.parse(
    await readFile(path.join(source, "server-lock.json"), "utf8"),
  );
  running = Number.isInteger(lock.pid) && processAlive(lock.pid);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
try {
  const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
    signal: AbortSignal.timeout(1500),
  });
  running = running || response.ok;
} catch {}
if (running)
  throw new Error(
    "Stop Fleet Studio and its worker before making a filesystem backup.",
  );
await stat(path.join(source, "postgres"));
const stamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-"),
  destination = path.resolve(
    process.env.FLEET_BACKUP_DIR ?? "backups",
    `fleet-${stamp}`,
  );
if (destination === source || destination.startsWith(source + path.sep))
  throw new Error(
    "Backup destination cannot be inside the live data directory.",
  );
await mkdir(path.dirname(destination), { recursive: true });
await mkdir(destination, { recursive: false });
await cp(source, path.join(destination, "data"), {
  recursive: true,
  errorOnExist: true,
  force: false,
  filter: (p) =>
    path.basename(p) !== "runtime" &&
    !path.basename(p).startsWith("server-lock") &&
    path.basename(p) !== "worker-temp",
});
await writeFile(
  path.join(destination, "manifest.json"),
  JSON.stringify(
    {
      format: "fleet-local-backup-v1",
      createdAt: new Date().toISOString(),
      contains: [
        "embedded PostgreSQL",
        "uploads",
        "encrypted session if present",
        "encryption key",
        "worker credential",
      ],
      warning:
        "Sensitive backup. Keep encrypted and restrict access. Restore into a new data directory, never over the original.",
    },
    null,
    2,
  ),
);
console.log(`Backup created: ${destination}`);
