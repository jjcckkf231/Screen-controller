import { createHash } from "node:crypto";
import type { Locator, Page } from "playwright";
import type { Device, Group } from "../shared/domain.ts";
import { powerScheduleSchema, idSchema, nameSchema } from "../shared/domain.ts";
import type { ConnectorConfig } from "./config.ts";
import type { Progress } from "./types.ts";
import { totalCount, fieldValue } from "./field-format.ts";
import { readDevice } from "./xiaohui-device.ts";
const stableId = (kind: string, value: string) =>
  `xh-${kind}-${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
export async function readFleet(
  page: Page,
  config: ConnectorConfig,
  progress: Progress,
): Promise<{ devices: Device[]; groups: Group[] }> {
  const mapping = config.fleetRead;
  if (!mapping?.commissioned)
    throw new Error("Read-only fleet mapping has not been commissioned.");
  const address = new URL(mapping.path, config.origin);
  if (address.origin !== config.origin)
    throw new Error("Unexpected fleet page origin.");
  await page.goto(address.href, { waitUntil: "domcontentloaded" });
  const account = page.locator(config.accountSelector);
  await account.waitFor({ state: "visible" });
  if (
    (await account.count()) !== 1 ||
    (await account.innerText()).trim() !== config.expectedAccount
  )
    throw new Error("Account identity failed before fleet read.");
  const total = page.locator(mapping.totalSelector);
  await total.waitFor({ state: "visible" });
  await page.locator(".ivu-table .ivu-spin-fix").waitFor({state: "hidden"});
  if (mapping.minimumDeviceCount > 0)
    await page.locator(mapping.rowSelector).first().waitFor({state: "visible"});
  if ((await total.count()) !== 1)
    throw new Error("Expected exactly one fleet total counter.");
  const expected = totalCount(await total.innerText(), mapping.totalFormat);
  if (expected < mapping.minimumDeviceCount)
    throw new Error("Fleet total is below the configured minimum; previous state is preserved.");
  if (expected > 500)
    throw new Error("This workspace is limited to 500 imported screens.");
  const devices: Device[] = [],
    groups = new Map<string, Group>(),
    seen = new Set<string>();
  const read = async (row: Locator, key: keyof typeof mapping.fields) => {
    const field = mapping.fields[key];
    if (!field) return null;
    const node = row.locator(field.selector);
    if ((await node.count()) !== 1)
      throw new Error(`Fleet field ${key} is missing or ambiguous.`);
    return fieldValue(
      (field.attribute
        ? await node.getAttribute(field.attribute)
        : await node.innerText()
      )?.trim() ?? null, field.format
    );
  };
  const number = (value: string | null, min: number, max: number) => {
    if (value === null || value === "") return null;
    if (!/^\d+(\.\d+)?%?$/.test(value))
      throw new Error("Numeric fleet field is not an unambiguous number.");
    const n = Number(value.replace("%", ""));
    if (n < min || n > max)
      throw new Error("Numeric fleet field is outside its supported range.");
    return n;
  };
  for (let pageNumber = 0; pageNumber < mapping.maxPages; pageNumber++) {
    await progress(
      "reading",
      `Reading fleet page ${pageNumber + 1} using mapping ${mapping.revision}.`,
    );
    const rows = page.locator(mapping.rowSelector);
    if (expected > 0) await rows.first().waitFor({ state: "visible" });
    const rowCount = await rows.count();
    if (!rowCount && devices.length < expected)
      throw new Error(
        "No rows found before the expected fleet total was reached.",
      );
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i),
        externalId = idSchema.parse(await read(row, "externalId")),
        name = nameSchema.parse(await read(row, "name"));
      if (seen.has(externalId))
        throw new Error(
          "Duplicate device ID found. Pagination may not have advanced.",
        );
      seen.add(externalId);
      const externalGroup = await read(row, "groupId"),
        groupName = await read(row, "groupName"),
        groupId = externalGroup ? stableId("group", externalGroup) : null;
      if (groupId) {
        if (!groupName) throw new Error("Group ID has no verified group name.");
        groups.set(groupId, {
          id: groupId,
          name: nameSchema.parse(groupName),
          parentId: null,
          externalId: externalGroup!,
          version: 1,
        });
      }
      const status = await read(row, "online"),
        power = await read(row, "power"),
        schedule = await read(row, "powerScheduleJson"),
        now = new Date().toISOString();
      devices.push({
        id: stableId("device", externalId),
        externalId,
        name,
        groupId,
        online:
          status !== null && mapping.onlineValues.includes(status)
            ? true
            : status !== null && mapping.offlineValues.includes(status)
              ? false
              : null,
        capabilities: mapping.deviceCapabilities,
        version: 1,
        lastSeenAt: null,
        settings: {
          brightness: number(await read(row, "brightness"), 0, 100),
          volume: number(await read(row, "volume"), 0, 100),
          rotation: number(await read(row, "rotation"), 0, 359),
          power:
            power !== null && mapping.onValues.includes(power)
              ? "on"
              : power !== null && mapping.offValues.includes(power)
                ? "off"
                : "unknown",
          width: number(await read(row, "width"), 1, 16384) ?? 0,
          height: number(await read(row, "height"), 1, 16384) ?? 0,
          programId: null,
          programName: await read(row, "programName"),
          powerSchedule: schedule
            ? powerScheduleSchema.parse(JSON.parse(schedule))
            : null,
          firmware: await read(row, "firmware"),
          timezone: await read(row, "timezone"),
          observedAt: now,
          source: "xiaohui-cloud-ui",
        },
      });
    }
    if (devices.length === expected) break;
    if (devices.length > expected)
      throw new Error("Read more device rows than the provider total.");
    if (!mapping.nextPageSelector)
      throw new Error(
        "More devices exist but no verified pagination control was supplied.",
      );
    const next = page.locator(mapping.nextPageSelector);
    if ((await next.count()) !== 1 || (await next.isDisabled()))
      throw new Error("Pagination ended before all devices were read.");
    const firstId = await read(rows.first(), "externalId");
    await next.click();
    // Wait for a visible identity change; no fixed sleeps or page-internal state are used.
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const currentRows = page.locator(mapping.rowSelector);
      if (
        (await currentRows.count()) &&
        (await read(currentRows.first(), "externalId")) !== firstId
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  if (devices.length !== expected)
    throw new Error(
      "Incomplete fleet read. Previous cached state is preserved.",
    );
  for (const device of devices.filter(d=>config.detailDeviceIds.includes(d.externalId))) {
    await progress("reading",`Reading verified detail fields for ${device.name}.`);
    const details=await readDevice(page,device.externalId);
    device.online=details.online === "Online" ? true : details.online === "Offline" ? false : null;
    device.settings.volume=details.volume;
    device.settings.observedAt=details.observedAt;
    if(config.nativeVolume?.commissioned && config.nativeVolume.deviceIds.includes(device.externalId)) device.capabilities=[...new Set([...device.capabilities,"volume"])];
  }
  return { devices, groups: [...groups.values()] };
}
