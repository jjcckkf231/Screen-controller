import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  cp,
  readdir,
  rm,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { openDatabase, createRecord, requireRecord } from "../server/db.ts";
import { blankProgram, type Program } from "../shared/domain.ts";
import { acquireServerLock } from "../server/lock.ts";

test("stopped local backup restores database and media into a new directory; active ownership blocks backup", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "fleet-backup-test-")),
    data = path.join(root, "data"),
    backups = path.join(root, "backups");
  const db = await openDatabase(data);
  const program = {
    ...blankProgram("Restore verification"),
    id: "backup-program",
    version: 1,
    status: "draft" as const,
    updatedAt: new Date().toISOString(),
  };
  await createRecord(db, "program", program);
  await mkdir(path.join(data, "uploads"));
  await writeFile(path.join(data, "uploads", "test-asset"), "fixture-media");
  await db.close();
  const command = () =>
    spawnSync(process.execPath, ["--import", "tsx", "scripts/backup.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FLEET_DATA_DIR: data,
        FLEET_BACKUP_DIR: backups,
        PORT: "49999",
        DATABASE_URL: "",
      },
      encoding: "utf8",
      windowsHide: true,
    });
  try {
    const release = await acquireServerLock(data);
    let result = command();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Stop Fleet Studio/);
    await release();
    result = command();
    assert.equal(result.status, 0, result.stderr);
    const names = await readdir(backups);
    assert.equal(names.length, 1);
    const restore = path.join(root, "restored");
    await cp(path.join(backups, names[0], "data"), restore, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    const restored = await openDatabase(restore);
    try {
      assert.equal(
        (await requireRecord<Program>(restored, "program", "backup-program"))
          .name,
        program.name,
      );
      assert.equal(
        await readFile(path.join(restore, "uploads", "test-asset"), "utf8"),
        "fixture-media",
      );
    } finally {
      await restored.close();
    }
    assert.equal(
      await readFile(path.join(data, "uploads", "test-asset"), "utf8"),
      "fixture-media",
    );
  } finally {
    assert(path.basename(root).startsWith("fleet-backup-test-"));
    await rm(root, { recursive: true, force: true });
  }
});
