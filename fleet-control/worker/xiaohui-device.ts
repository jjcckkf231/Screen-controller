import type { Page } from "playwright";
import type { ConnectorConfig } from "./config.ts";
export class AccountMismatchError extends Error {}
export async function openDevice(
  page: Page,
  externalId: string,
  config: ConnectorConfig,
) {
  if (externalId.startsWith("EXAMPLE-"))
    throw new Error(
      "Configure an explicitly authorized test device before live operations.",
    );
  const address = new URL(
    config.fleetRead?.path ?? config.entryPath,
    config.origin,
  );
  if (address.origin !== config.origin)
    throw new Error("Unexpected device page origin");
  if (page.url() === address.href) await page.reload();
  else await page.goto(address.href);
  const account = page.locator(config.accountSelector);
  await account.waitFor();
  if (
    (await account.count()) !== 1 ||
    (await account.innerText()).trim() !== config.expectedAccount
  )
    throw new AccountMismatchError("Account mismatch");
  const rows = page.locator(
    config.fleetRead?.rowSelector ?? "tr.ivu-table-row",
  );
  await rows.first().waitFor();
  const row = rows.filter({ has: page.getByText(externalId, { exact: true }) });
  const visited = new Set<string>();
  for (
    let n = 0;
    n < (config.fleetRead?.maxPages ?? 50) && (await row.count()) === 0;
    n++
  ) {
    const first = await rows.first().innerText();
    if (visited.has(first))
      throw new Error("Device pagination did not advance");
    visited.add(first);
    const nextSelector = config.fleetRead?.nextPageSelector;
    if (!nextSelector) break;
    const next = page.locator(nextSelector);
    if ((await next.count()) !== 1 || (await next.isDisabled())) break;
    await next.click();
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && (await rows.first().innerText()) === first)
      await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if ((await row.count()) !== 1)
    throw new Error("Device identity is ambiguous");
  await row.getByText("Details", { exact: true }).click();
  const pane = page.locator("#pane-otherData");
  await pane.getByText(externalId, { exact: true }).waitFor();
  return pane;
}
export async function readDevice(
  page: Page,
  externalId: string,
  config: ConnectorConfig,
) {
  const pane = await openDevice(page, externalId, config);
  const value = async (label: string) => {
    const item = pane
      .locator(".item")
      .filter({
        has: page.locator(".title").getByText(label, { exact: true }),
      });
    if ((await item.count()) !== 1)
      throw new Error(`Missing or ambiguous field ${label}`);
    return (await item.locator(".value").innerText()).trim();
  };
  const online = await value("Online Status：");
  // Missing optional controls must not erase a successfully read online status.
  const volumeText = await value("Volume：").catch(() => "");
  const volume = /^\d+%$/.test(volumeText)
    ? Number(volumeText.slice(0, -1))
    : null;
  return {
    externalId,
    online,
    volume: volume !== null && volume <= 100 ? volume : null,
    observedAt: new Date().toISOString(),
  };
}
export async function setVolume(
  page: Page,
  externalId: string,
  volume: number,
  config: ConnectorConfig,
) {
  if (!Number.isInteger(volume) || volume < 0 || volume > 100)
    throw new Error("Invalid volume");
  const before = await readDevice(page, externalId, config);
  if (before.online !== "Online")
    throw new Error("Test screen is offline; write stopped");
  await page
    .locator("#pane-otherData")
    .getByRole("button", { name: "More", exact: false })
    .click();
  await page
    .locator(".el-dropdown-menu, .ivu-dropdown-menu")
    .getByText("Volume", { exact: true })
    .filter({ visible: true })
    .click();
  const dialog = page
    .getByRole("dialog")
    .filter({ has: page.getByText("Volume Setting", { exact: true }) });
  await dialog.waitFor();
  await dialog.locator(".ivu-spin:visible").waitFor({ state: "hidden" });
  const match = /Set the volume level to (\d+)%/.exec(await dialog.innerText());
  if (!match) throw new Error("Volume form is unreadable");
  const current = Number(match[1]);
  if (volume !== current) {
    const track = dialog.locator(".ivu-slider-wrap:visible");
    const box = await track.boundingBox();
    if (!box || (await track.count()) !== 1)
      throw new Error("Slider track is ambiguous");
    const knob = await dialog
      .locator(".ivu-slider-button:visible")
      .boundingBox();
    if (!knob) throw new Error("Missing slider handle");
    await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + (box.width * volume) / 100,
      knob.y + knob.height / 2,
      { steps: 5 },
    );
    await page.mouse.up();
    console.log("Slider value", await dialog.innerText());
  }
  await dialog
    .getByText(`Set the volume level to ${volume}%`, { exact: true })
    .waitFor();
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  try {
    await dialog.waitFor({ state: "hidden", timeout: 5000 });
  } catch {
    console.log(
      "Submit response",
      await page
        .locator(
          ".el-message-box:visible, .el-message:visible, .ivu-message:visible",
        )
        .allInnerTexts(),
    );
    await page.screenshot({ path: ".data/connection-check/volume-submit.png" });
    console.log("Form stayed open; checking freshly reloaded device state.");
  }
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const after = await readDevice(page, externalId, config);
    if (after.volume === volume) return after;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    "Volume read-back differs after waiting for device report; result unknown",
  );
}
