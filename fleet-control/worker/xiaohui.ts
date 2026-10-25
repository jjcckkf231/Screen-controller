import { chromium, type Page } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { decryptJson, encryptJson, localSecret } from "../server/secrets.ts";
import {
  connectorConfigSchema,
  type ConnectorConfig,
  type stepSchema,
} from "./config.ts";
import type { z } from "zod";
import type { Outcome, Progress, Work } from "./types.ts";
import { readFleet } from "./read-fleet.ts";
import { restoreXiaohuiSession, captureXiaohuiSession } from "./browser-session.ts";
import { setVolume } from "./xiaohui-device.ts";

export async function loadConnector(dataDir: string) {
  return connectorConfigSchema.parse(
    JSON.parse(
      await readFile(
        process.env.XIAOHUI_CONFIG_FILE ?? path.join(dataDir, "xiaohui.json"),
        "utf8",
      ),
    ),
  );
}
export async function executeXiaohui(
  work: Work,
  progress: Progress,
  dataDir: string,
  download: (id: string) => Promise<string>,
): Promise<Outcome> {
  const outcome: Outcome = { state: "needs_human", error: null, results: [] };
  let config: ConnectorConfig;
  try {
    config = await loadConnector(dataDir);
  } catch {
    return blocked(
      work,
      "Xiaohui mapping is missing or invalid. Commission this connection against the test fleet first.",
    );
  }
  const workflow = config.workflows[work.job.command];
  const nativeVolume=work.job.command === "device_control" && work.job.payload.action === "volume" && config.nativeVolume?.commissioned;
  const reading =
    work.job.command === "sync_fleet" || work.job.command === "refresh_device";
  if (reading ? !config.fleetRead?.commissioned : !workflow?.commissioned && !nativeVolume)
    return blocked(
      work,
      "This workflow has not passed live commissioning. No browser action was performed.",
    );
  if (config.expectedAccount !== work.job.payload.expectedAccount)
    return blocked(
      work,
      "The configured Xiaohui account does not match the frozen job.",
    );
  let storageState;
  try {
    storageState = decryptJson<
      Awaited<ReturnType<import("playwright").BrowserContext["storageState"]>>
    >(
      await readFile(
        process.env.XIAOHUI_AUTH_FILE ?? path.join(dataDir, "xiaohui-auth.enc"),
        "utf8",
      ),
      await localSecret(dataDir, "auth-key"),
    );
  } catch {
    return blocked(
      work,
      "The Xiaohui login session is missing or cannot be decrypted. Run the connection setup locally.",
    );
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      storageState,
      acceptDownloads: false,
    });
    const page = await context.newPage();
    await restoreXiaohuiSession(context, storageState);
    page.setDefaultTimeout(15000);
    // Keep the adapter on the approved vendor origin. Stop rather than follow a surprise destination.
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (
        request.isNavigationRequest() &&
        request.frame() === page.mainFrame() &&
        new URL(request.url()).origin !== config.origin
      )
        return route.abort();
      return route.continue();
    });
    await page.goto(config.origin + config.entryPath, {
      waitUntil: "domcontentloaded",
    });
    const account = page.locator(config.accountSelector);
    await account.waitFor({state: "visible"});
    if (
      (await account.count()) !== 1 ||
      (await account.innerText()).trim() !== config.expectedAccount
    )
      return blocked(
        work,
        "Login expired or account identity could not be verified. No write was performed.",
      );
    if (reading) {
      const fleet = await readFleet(page, config, progress);
      await writeFile(process.env.XIAOHUI_AUTH_FILE ?? path.join(dataDir, "xiaohui-auth.enc"),
        encryptJson(await captureXiaohuiSession(context), await localSecret(dataDir, "auth-key")), {mode: 0o600});
      if (work.job.command === "sync_fleet")
        return { state: "succeeded", error: null, results: [], ...fleet };
      const devices = fleet.devices.filter((d) =>
        work.job.targetIds.includes(d.id),
      );
      const results = work.job.targetIds.map((id) => ({
        id,
        state: devices.some((d) => d.id === id)
          ? ("succeeded" as const)
          : ("failed" as const),
        message: devices.some((d) => d.id === id)
          ? "Current cloud settings read. Unmapped fields remain unknown."
          : "This device was not found in the verified fleet read.",
      }));
      return {
        state: results.every((r) => r.state === "succeeded")
          ? "succeeded"
          : devices.length
            ? "partial"
            : "failed",
        error: null,
        results,
        devices,
      };
    }
    if (nativeVolume) {
      const updated=[];
      for(const id of work.job.targetIds) {
        const device=work.devices.find(d=>d.id===id);
        if(!device || !config.nativeVolume!.deviceIds.includes(device.externalId)) return blocked(work,"Target has not passed volume commissioning.");
      }
      for(const id of work.job.targetIds) {
        const device=work.devices.find(d=>d.id===id)!;
        await progress("working",`Setting volume for ${device.name}; checking reported value after reload.`);
        try {
          const report=await setVolume(page,device.externalId,Number(work.job.payload.value));
          updated.push({...device,online:true,settings:{...device.settings,volume:report.volume,observedAt:report.observedAt,source:"xiaohui-cloud-ui"}});
          outcome.results.push({id,state:"succeeded",message:"Volume verified in fresh cloud device report. Physical audio not independently confirmed."});
        } catch(error) {
          return {state:"result_unknown",error:error instanceof Error?error.message:"Volume operation interrupted",results:[...outcome.results,...work.job.targetIds.filter(t=>!outcome.results.some(r=>r.id===t)).map(t=>({id:t,state:"unknown" as const,message:"Stopped after an unverified operation; no automatic retry."}))],devices:updated};
        }
      }
      return {state:"succeeded",error:null,results:outcome.results,devices:updated};
    }
    if (!workflow) return blocked(work, "Missing workflow.");
    const targets = work.job.targetIds.length
      ? work.job.targetIds
      : ["workspace"];
    if (!workflow.perDevice && work.job.targetIds.length > 1)
      return blocked(
        work,
        "Batch workflows require an individually verified per-device recipe.",
      );
    for (const id of targets) {
      const target = work.devices.find((d) => d.id === id);
      const values = {
        ...work.job.payload,
        device: target,
        jobId: work.job.id,
      };
      let mayHaveWritten = false;
      const apply = async (
        step: z.infer<typeof stepSchema>,
        verifying = false,
      ) => {
        const expand = (text: string) =>
          text.replace(/\{\{([\w.]+)\}\}/g, (_, key: string) => {
            const value = key
              .split(".")
              .reduce<unknown>(
                (v, k) =>
                  v && typeof v === "object"
                    ? (v as Record<string, unknown>)[k]
                    : undefined,
                values,
              );
            if (
              value === undefined ||
              value === null ||
              typeof value === "object"
            )
              throw new Error(`Missing scalar mapping: ${key}`);
            return String(value);
          });
        if (step.action === "goto") {
          const destination = new URL(expand(step.path), config.origin);
          if (destination.origin !== config.origin)
            throw new Error("Unexpected navigation origin.");
          await page.goto(destination.href, { waitUntil: "domcontentloaded" });
          return;
        }
        // Only validated external IDs may be interpolated into selectors. Names/content are data, never selectors.
        if (
          [...step.selector.matchAll(/\{\{([^}]+)\}\}/g)].some(
            (match) => match[1] !== "device.externalId",
          )
        )
          throw new Error(
            "Selector interpolation is limited to device.externalId.",
          );
        const locator = page.locator(expand(step.selector));
        if ((await locator.count()) !== 1)
          throw new Error(
            "Expected exactly one matching control. Page layout may have changed.",
          );
        if (!verifying && !step.action.startsWith("assert_"))
          mayHaveWritten = true;
        if (step.action === "click") await locator.click();
        if (step.action === "fill") await locator.fill(expand(step.value));
        if (step.action === "select")
          await locator.selectOption(expand(step.value));
        if (step.action === "check") await locator.setChecked(step.checked);
        if (step.action === "upload")
          await locator.setInputFiles(await download(expand(step.mediaId)));
        if (
          step.action === "assert_text" &&
          (await locator.innerText()).trim() !== expand(step.equals)
        )
          throw new Error("Read-back text did not match the expected result.");
        if (
          step.action === "assert_value" &&
          (await locator.inputValue()) !== expand(step.equals)
        )
          throw new Error("Read-back value did not match the expected result.");
      };
      try {
        await progress(
          "working",
          `Executing commissioned workflow ${workflow.revision} for ${target?.name ?? "workspace"}.`,
        );
        for (const [index, step] of workflow.steps.entries()) {
          await progress(
            "working",
            `Step ${index + 1} of commissioned workflow ${workflow.revision}.`,
          );
          await apply(step);
        }
        await progress(
          "verifying",
          "Reopening the configured settings and checking explicit postconditions.",
        );
        for (const step of workflow.verify) await apply(step, true);
        if (id !== "workspace")
          outcome.results.push({
            id,
            state: "succeeded",
            message:
              "Configured cloud postconditions verified. Physical playback is not independently confirmed.",
            evidence: {
              workflow: workflow.revision,
              verifiedAt: new Date().toISOString(),
              source: "xiaohui-cloud-ui",
            },
          });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Browser action failed.";
        if (id !== "workspace")
          outcome.results.push({
            id,
            state: mayHaveWritten ? "unknown" : "failed",
            message,
          });
        outcome.error = message;
        // No automatic replay after any possible write. Stop the remainder of this batch.
        for (const pending of targets.slice(targets.indexOf(id) + 1))
          if (pending !== "workspace")
            outcome.results.push({
              id: pending,
              state: "pending",
              message: "Not started after an earlier target failed.",
            });
        outcome.state = mayHaveWritten
          ? "result_unknown"
          : outcome.results.some((r) => r.state === "succeeded")
            ? "partial"
            : "needs_human";
        return outcome;
      }
    }
    if (work.job.targetIds.length && config.fleetRead?.commissioned) {
      try {
        const fleet = await readFleet(page, config, progress);
        outcome.devices = fleet.devices.filter((d) =>
          work.job.targetIds.includes(d.id),
        );
      } catch {
        return {
          ...outcome,
          state: "result_unknown",
          error:
            "Action postconditions passed, but the subsequent fleet read failed. Inspect Xiaohui before retrying.",
        };
      }
    }
    return { ...outcome, state: "succeeded" };
  } finally {
    await browser.close();
  }
}
function blocked(work: Work, error: string): Outcome {
  return {
    state: "needs_human",
    error,
    results: work.job.targetIds.map((id) => ({
      id,
      state: "pending",
      message: "Not started.",
    })),
  };
}
