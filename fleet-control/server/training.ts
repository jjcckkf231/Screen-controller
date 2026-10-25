import { randomUUID } from "node:crypto";
import {
  commands,
  type Device,
  type Group,
  type Connection,
  type Program,
} from "../shared/domain.ts";
import {
  audit,
  getRecord,
  listRecords,
  putRecord,
  type Sql,
  fail,
} from "./db.ts";

export async function initializeTraining(db: Sql, actor: string, count = 6) {
  const c = (await getRecord<Connection>(db, "connection", "primary"))!;
  if (
    (await listRecords<Device>(db, "device")).some(
      (d) => !d.externalId.startsWith("TRAIN-"),
    )
  )
    fail(409, "REAL_DATA_PRESENT", "Use a separate workspace for training.");
  const groups: Group[] = [
    {
      id: "training-bangkok",
      name: "Bangkok / กรุงเทพฯ",
      parentId: null,
      version: 1,
    },
    {
      id: "training-siam",
      name: "Siam / สยาม",
      parentId: "training-bangkok",
      version: 1,
    },
    {
      id: "training-chiangmai",
      name: "Chiang Mai / เชียงใหม่",
      parentId: null,
      version: 1,
    },
  ];
  for (const g of groups) {
    await putRecord(db, "group", g.id, g);
    await putRecord(db, "training-group", g.id, g);
  }
  const devices: Device[] = Array.from({ length: count }, (_, i) => ({
    id: `training-screen-${i + 1}`,
    externalId: `TRAIN-${String(i + 1).padStart(3, "0")}`,
    name: i < 4 ? `Siam · Screen ${i + 1}` : `Nimman · Screen ${i + 1}`,
    groupId: i < 4 ? "training-siam" : "training-chiangmai",
    online: i !== 4,
    settings: {
      brightness: 70,
      volume: 40,
      rotation: i % 2 ? 0 : 270,
      power: "on",
      width: i % 2 ? 1920 : 1080,
      height: i % 2 ? 1080 : 1920,
      programId: null,
      programName: null,
      firmware: "Training fixture",
      timezone: "Asia/Bangkok",
      observedAt: new Date().toISOString(),
      source: "training",
      powerSchedule: {
        enabled: true,
        timezone: "Asia/Bangkok",
        rules: [{ days: [1, 2, 3, 4, 5, 6, 7], on: "09:00", off: "22:00" }],
      },
    },
    capabilities: [
      "power_schedule",
      "brightness",
      "volume",
      "rotation",
      "power",
      "restart",
      "screenshot",
    ],
    version: 1,
    lastSeenAt: i === 4 ? null : new Date().toISOString(),
  }));
  for (const d of devices) {
    await putRecord(db, "device", d.id, d);
    await putRecord(db, "training-device", d.id, d);
  }
  await putRecord(db, "connection", "primary", {
    ...c,
    mode: "training",
    accountLabel: "Training workspace",
    verifiedAccount: "training",
    capabilities: [...commands],
    maxTargets: 500,
    allowedDeviceIds: devices.map((d) => d.id),
    lastSyncAt: new Date().toISOString(),
    lastError: null,
    consecutiveFailures: 0,
  });
  await audit(db, actor, "training.initialize", "primary", { count });
}
export async function createTrainingDevice(
  db: Sql,
  name: string,
  groupId: string | null,
  width: number,
  height: number,
) {
  const template = (await listRecords<Device>(db, "training-device"))[0];
  if (!template)
    fail(409, "TRAINING_REQUIRED", "Initialize the training workspace first.");
  const device: Device = {
    ...structuredClone(template!),
    id: randomUUID(),
    externalId: "TRAIN-" + randomUUID().slice(0, 8),
    name,
    groupId,
    online: true,
    version: 1,
    settings: {
      ...template!.settings,
      width,
      height,
      programId: null,
      programName: null,
    },
  };
  await putRecord(db, "training-device", device.id, device);
  await putRecord(db, "device", device.id, device);
  const c = (await getRecord<Connection>(db, "connection", "primary"))!;
  await putRecord(db, "connection", "primary", {
    ...c,
    allowedDeviceIds: [...c.allowedDeviceIds, device.id],
  });
  return device;
}
export function collectMediaIds(program: Program) {
  return [
    ...new Set(
      program.screens.flatMap((s) => s.layers.flatMap((l) => l.mediaIds)),
    ),
  ];
}
