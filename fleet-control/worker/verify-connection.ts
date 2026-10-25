import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { connectorConfigSchema } from "./config.ts";
import { readFleet } from "./read-fleet.ts";
import { createInterface } from "node:readline";
import { encryptJson, localSecret } from "../server/secrets.ts";
import { captureXiaohuiSession } from "./browser-session.ts";

// A separate temporary browser session: no credentials are copied from another browser.
// Read-only verification never enables writes or imports into the user's workspace.
const configPath = process.argv[2];
if (!configPath) throw new Error("Supply the observed connector mapping file.");
const config = connectorConfigSchema.parse(JSON.parse(await readFile(configPath, "utf8")));
if (!config.fleetRead) throw new Error("A fleet mapping is required.");
const browser = await chromium.launch({ headless: false });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(config.origin + config.entryPath);
  console.log("Sign in in this separate Chromium window. Login detection stays open until you close the window.");
  await page.locator(config.accountSelector).filter({ hasText: config.expectedAccount }).waitFor({timeout: 0});
  const saveSession = async () => {
    const identity = page.locator(config.accountSelector);
    if (await identity.count() !== 1 || (await identity.innerText()).trim() !== config.expectedAccount)
      throw new Error("Account mismatch; session not saved.");
    const dataDir = path.resolve(process.env.FLEET_DATA_DIR ?? ".data");
    await mkdir(dataDir, {recursive: true});
    await writeFile(path.join(dataDir, "xiaohui-auth.enc"), encryptJson(await captureXiaohuiSession(context), await localSecret(dataDir, "auth-key")), {mode: 0o600});
    console.log("Encrypted session saved locally for this account.");
  };
  if (process.argv.includes("--save-session")) await saveSession();
  const verify = async () => {
  try {
  console.log("Observed fleet counter:", await page.locator(config.fleetRead!.totalSelector).innerText());
  const fleet = await readFleet(page, {
    ...config, fleetRead: {...config.fleetRead!, commissioned: true},
  }, async (_step, detail) => { console.log(detail); });
  const evidence = path.resolve(".data/connection-check");
  await mkdir(evidence, { recursive: true });
  await writeFile(path.join(evidence, "read-result.json"), JSON.stringify({
    checkedAt: new Date().toISOString(), account: config.expectedAccount,
    mappingRevision: config.fleetRead!.revision, ...fleet,
  }, null, 2));
  console.log(`Verified ${fleet.devices.length} real device records. No screen settings changed.`);
  } catch (error) { console.error(error instanceof Error ? error.message : error); }
  };
  await verify();
  console.log("Browser remains open. Commands: retry, save-session, close. Save only with owner authorization.");
  const input = createInterface({input: process.stdin});
  const timer = setTimeout(() => input.close(), 30 * 60 * 1000);
  for await (const line of input) {
    if (line.trim() === "close") break;
    if (line.trim() === "retry") await verify();
    if (line.trim() === "save-session") {
      await saveSession();
    }
  }
  clearTimeout(timer);
  input.close();
} finally {
  await browser.close();
}
