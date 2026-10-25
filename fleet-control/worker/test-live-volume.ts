import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { decryptJson, encryptJson, localSecret } from "../server/secrets.ts";
import {
  restoreXiaohuiSession,
  captureXiaohuiSession,
  type SavedBrowserState,
} from "./browser-session.ts";
import { readDevice, setVolume } from "./xiaohui-device.ts";
import { loadConnector } from "./xiaohui.ts";
const config = await loadConnector(process.env.FLEET_DATA_DIR ?? ".data");
const targets = [
  { name: "S1", id: "EXAMPLE-DEVICE-ID" },
  { name: "S2", id: "EXAMPLE-DEVICE-ID" },
  { name: "S3", id: "EXAMPLE-DEVICE-ID" },
  { name: "S4", id: "EXAMPLE-DEVICE-ID" },
  { name: "S5", id: "EXAMPLE-DEVICE-ID" },
];
const state = decryptJson<SavedBrowserState>(
  await readFile(".data/xiaohui-auth.enc", "utf8"),
  await localSecret(".data", "auth-key"),
);
const browser = await chromium.launch({ headless: true });
const evidence: unknown[] = [];
await mkdir(".data/connection-check", { recursive: true });
try {
  const context = await browser.newContext({ storageState: state });
  await restoreXiaohuiSession(context, state);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("response", (r) => {
    if (r.request().method() !== "GET")
      console.log(
        "Cloud request",
        r.request().method(),
        new URL(r.url()).pathname,
        r.status(),
      );
  });
  for (const target of targets) {
    const before = await readDevice(page, target.id, config);
    console.log(target.name, JSON.stringify(before));
    evidence.push({ name: target.name, before });
    await writeFile(
      ".data/connection-check/live-volume.json",
      JSON.stringify(evidence, null, 2),
    );
    if (before.online !== "Online")
      throw new Error(`${target.name} offline; stopped`);
    if (!process.argv.includes("--write")) continue;
    if (before.volume === null)
      throw new Error("Cannot restore an unknown original volume");
    const testValue = before.volume > 0 ? before.volume - 1 : 1;
    try {
      const after = await setVolume(page, target.id, testValue, config);
      evidence.push({ name: target.name, test: after });
      console.log(`${target.name}: change verified ${testValue}%`);
    } finally {
      const restored = await setVolume(page, target.id, before.volume, config);
      evidence.push({ name: target.name, restored });
      console.log(`${target.name}: restored ${before.volume}%`);
      await writeFile(
        ".data/connection-check/live-volume.json",
        JSON.stringify(evidence, null, 2),
      );
    }
  }
  await writeFile(
    ".data/xiaohui-auth.enc",
    encryptJson(
      await captureXiaohuiSession(context),
      await localSecret(".data", "auth-key"),
    ),
    { mode: 0o600 },
  );
} finally {
  await browser.close();
}
