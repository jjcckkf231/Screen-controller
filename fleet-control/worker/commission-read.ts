import { chromium, type BrowserContext } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { connectorConfigSchema } from "./config.ts";
import { readFleet } from "./read-fleet.ts";
import { decryptJson, encryptJson, localSecret } from "../server/secrets.ts";
import { restoreXiaohuiSession, captureXiaohuiSession } from "./browser-session.ts";

try { process.loadEnvFile(); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const dataDir = path.resolve(process.env.FLEET_DATA_DIR ?? ".data");
const inputPath = process.argv[2];
if (!inputPath) throw new Error("Supply the observed mapping file.");
const config = connectorConfigSchema.parse(JSON.parse(await readFile(inputPath, "utf8")));
if (!config.fleetRead) throw new Error("No read mapping supplied.");
// This command verifies read access only; it cannot commission any write workflow.
const readConfig = {...config, fleetRead: {...config.fleetRead, commissioned: true}, workflows: {}};
if (process.argv.includes("--enable-tested-volume")) {
  const proof=JSON.parse(await readFile(path.join(dataDir,"connection-check/live-volume.json"),"utf8"));
  const ids=["EXAMPLE-DEVICE-ID","EXAMPLE-DEVICE-ID","EXAMPLE-DEVICE-ID","EXAMPLE-DEVICE-ID","EXAMPLE-DEVICE-ID"];
  for(const id of ids) {
    if(!proof.some((p:any)=>p.test?.externalId===id && p.test.volume===99) || !proof.some((p:any)=>p.restored?.externalId===id && p.restored.volume===100)) throw new Error("Missing successful volume test and restoration evidence");
  }
  readConfig.nativeVolume={commissioned:true,revision:"live-tested-2026-10-25-v1",deviceIds:ids};
  readConfig.detailDeviceIds=ids;
}
const storageState = decryptJson<Awaited<ReturnType<BrowserContext["storageState"]>>>(
  await readFile(path.join(dataDir, "xiaohui-auth.enc"), "utf8"),
  await localSecret(dataDir, "auth-key"),
);
const browser = await chromium.launch({headless: true});
try {
  const context = await browser.newContext({storageState});
  await restoreXiaohuiSession(context, storageState);
  const page = await context.newPage();
  page.on("response", response => {
    if (response.status() >= 500)
      console.log("Cloud response", response.status(), new URL(response.url()).pathname);
  });
  page.setDefaultTimeout(20000);
  const fleet = await readFleet(page, readConfig, async (_step, detail) => console.log(detail));
  console.log(`Verified ${fleet.devices.length} unique devices using the saved session.`);
  await writeFile(path.join(dataDir, "xiaohui-auth.enc"), encryptJson(await captureXiaohuiSession(context), await localSecret(dataDir, "auth-key")), {mode: 0o600});
  if (process.argv.includes("--import")) {
    const api = new URL(process.env.FLEET_API_URL ?? "http://127.0.0.1:4178");
    if (api.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(api.hostname))
      throw new Error("Remote setup requires HTTPS.");
    const response = await fetch(new URL("/api/internal/connect", api), {
      method: "POST",
      headers: {"Content-Type": "application/json", Authorization: "Bearer " + (process.env.FLEET_WORKER_TOKEN ?? await localSecret(dataDir, "worker-token"))},
      body: JSON.stringify({account: config.expectedAccount, capabilities: ["sync_fleet", "refresh_device",...(readConfig.nativeVolume?.commissioned?["device_control"]:[])], ...fleet}),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Import rejected (${response.status}): ${(await response.text()).slice(0, 1000)}`);
    await writeFile(path.join(dataDir, "xiaohui.json"), JSON.stringify(readConfig, null, 2));
    console.log(readConfig.nativeVolume?.commissioned ? "Tested volume control enabled for S1–S5 only." : "Fleet Studio connected for read-only refresh. No write capabilities enabled.");
  }
} finally { await browser.close(); }
