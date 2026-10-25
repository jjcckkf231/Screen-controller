import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
export function processAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
export async function acquireServerLock(dataDir: string) {
  await mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, "server-lock.json"),
    identity = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(file, "wx", 0o600);
      await handle.writeFile(
        JSON.stringify({
          pid: process.pid,
          identity,
          startedAt: new Date().toISOString(),
        }),
      );
      await handle.close();
      return async () => {
        try {
          const lock = JSON.parse(await readFile(file, "utf8"));
          if (lock.identity === identity) await rm(file);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const lock = JSON.parse(await readFile(file, "utf8"));
      if (!Number.isInteger(lock.pid) || lock.pid < 1 || processAlive(lock.pid))
        throw new Error(
          "This data directory already has a running server. Stop it before opening the same database again.",
        );
      await rename(
        file,
        path.join(dataDir, `server-lock.stale-${Date.now()}-${identity}.json`),
      );
    }
  }
  throw new Error("Could not acquire exclusive workspace ownership.");
}
