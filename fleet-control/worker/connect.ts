import { chromium } from "playwright";
import { createInterface } from "node:readline/promises";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { encryptJson, localSecret } from "../server/secrets.ts";
import { loadConnector } from "./xiaohui.ts";
import { readFleet } from "./read-fleet.ts";
import { commands } from "../shared/domain.ts";
import { captureXiaohuiSession } from "./browser-session.ts";
try {
  process.loadEnvFile();
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
const dataDir = path.resolve(process.env.FLEET_DATA_DIR ?? ".data");
const config = await loadConnector(dataDir);
const browser = await chromium.launch({ headless: false });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(config.origin + config.entryPath);
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  console.log(
    "Sign in yourself in the dedicated browser. Do not paste passwords or OTP codes here.",
  );
  await prompt.question("After signing in to the test account, press Enter. ");
  prompt.close();
  const identity = page.locator(config.accountSelector);
  if (
    (await identity.count()) !== 1 ||
    (await identity.innerText()).trim() !== config.expectedAccount
  )
    throw new Error(
      "Account identity did not match. No login session was saved.",
    );
  const sealed = encryptJson(
    await captureXiaohuiSession(context),
    await localSecret(dataDir, "auth-key"),
  );
  await writeFile(
    process.env.XIAOHUI_AUTH_FILE ?? path.join(dataDir, "xiaohui-auth.enc"),
    sealed,
    { mode: 0o600 },
  );
  console.log("Encrypted session saved.");
  if (!config.fleetRead?.commissioned)
    console.log(
      "Fleet read mapping is not commissioned. No live connection has been enabled.",
    );
  else {
    const fleet = await readFleet(page, config, async (_step, detail) => {
      console.log(detail);
    });
    const capabilities = commands.filter(
      (command) =>
        command === "sync_fleet" ||
        command === "refresh_device" ||
        config.workflows[command]?.commissioned,
    );
    const api = process.env.FLEET_API_URL ?? "http://127.0.0.1:4178";
    if (
      new URL(api).protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(new URL(api).hostname)
    )
      throw new Error("Remote connector setup requires HTTPS.");
    const response = await fetch(api + "/api/internal/connect", {
      method: "POST",
      headers: {
        Authorization:
          "Bearer " +
          (process.env.FLEET_WORKER_TOKEN ??
            (await localSecret(dataDir, "worker-token"))),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account: config.expectedAccount,
        capabilities,
        ...fleet,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new Error(
        `Fleet import rejected (${response.status}). Inspect the workspace connection settings.`,
      );
    console.log(
      `Imported ${fleet.devices.length} verified cloud device identities. Select only your test screens under Settings → Permitted target screens before any write.`,
    );
  }
} finally {
  await browser.close();
}
