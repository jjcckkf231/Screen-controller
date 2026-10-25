import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.ts";
import { openDatabase } from "./db.ts";
import { localSecret } from "./secrets.ts";
import { acquireServerLock } from "./lock.ts";
try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dataDir = path.resolve(
  process.env.FLEET_DATA_DIR ?? path.join(root, ".data"),
);
const releaseLock = await acquireServerLock(dataDir);
const db = await openDatabase(dataDir, process.env.DATABASE_URL).catch(
  async (error) => {
    await releaseLock();
    throw error;
  },
);
const token =
  process.env.FLEET_WORKER_TOKEN ??
  (await localSecret(dataDir, "worker-token"));
let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await app.close();
  await db.close();
  await releaseLock();
  process.exit(0);
};
const app = await buildApp({
  db,
  dataDir,
  workerToken: token,
  publicOrigin: process.env.PUBLIC_ORIGIN,
  secureCookies: process.env.SECURE_COOKIES === "true",
  distDir: path.join(root, "dist"),
  logger: true,
  shutdown,
});
await app
  .listen({
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 4178),
  })
  .catch(async (error) => {
    await db.close();
    await releaseLock();
    throw error;
  });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void shutdown();
  });
