import type { Page } from "playwright";
export async function openDevice(page: Page, externalId: string) {
  if (externalId.startsWith("EXAMPLE-")) throw new Error("Configure an explicitly authorized test device before live operations.");
  if (page.url() === "https://www.led-cloud.com/#/Rich/DeviceManage") await page.reload();
  else await page.goto("https://www.led-cloud.com/#/Rich/DeviceManage");
  const account = page.locator(".user > span:first-of-type");
  await account.waitFor();
  if ((await account.innerText()).trim() !== "YOUR_XIAOHUI_ACCOUNT") throw new Error("Account mismatch");
  const row = page.locator("tr.ivu-table-row").filter({has:page.getByText(externalId,{exact:true})});
  await row.waitFor();
  if (await row.count() !== 1) throw new Error("Device identity is ambiguous");
  await row.getByText("Details",{exact:true}).click();
  const pane = page.locator("#pane-otherData");
  await pane.getByText(externalId,{exact:true}).waitFor();
  return pane;
}
export async function readDevice(page: Page, externalId: string) {
  const pane = await openDevice(page,externalId);
  const value = async (label:string) => {
    const item = pane.locator(".item").filter({has:page.locator(".title").getByText(label,{exact:true})});
    if (await item.count() !== 1) throw new Error(`Missing or ambiguous field ${label}`);
    return (await item.locator(".value").innerText()).trim();
  };
  const volumeText = await value("Volume：");
  if (!/^\d+%$/.test(volumeText)) throw new Error("Invalid volume");
  return {externalId, online:await value("Online Status："), volume:Number(volumeText.slice(0,-1)), observedAt:new Date().toISOString()};
}
export async function setVolume(page: Page, externalId:string, volume:number) {
  if (!Number.isInteger(volume) || volume < 0 || volume > 100) throw new Error("Invalid volume");
  const before = await readDevice(page,externalId);
  if (before.online !== "Online") throw new Error("Test screen is offline; write stopped");
  await page.locator("#pane-otherData").getByRole("button",{name:"More",exact:false}).click();
  await page.locator(".el-dropdown-menu, .ivu-dropdown-menu").getByText("Volume",{exact:true}).filter({visible:true}).click();
  const dialog = page.getByRole("dialog").filter({has:page.getByText("Volume Setting",{exact:true})});
  await dialog.waitFor();
  await dialog.locator(".ivu-spin:visible").waitFor({state:"hidden"});
  const match = /Set the volume level to (\d+)%/.exec(await dialog.innerText());
  if (!match) throw new Error("Volume form is unreadable");
  const current = Number(match[1]);
  if (volume !== current) {
    const track = dialog.locator(".ivu-slider-wrap:visible");
    const box = await track.boundingBox();
    if (!box || await track.count() !== 1) throw new Error("Slider track is ambiguous");
    const knob=await dialog.locator(".ivu-slider-button:visible").boundingBox();
    if (!knob) throw new Error("Missing slider handle");
    await page.mouse.move(knob.x+knob.width/2,knob.y+knob.height/2);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width*volume/100,knob.y+knob.height/2,{steps:5});
    await page.mouse.up();
    console.log("Slider value", await dialog.innerText());
  }
  await dialog.getByText(`Set the volume level to ${volume}%`,{exact:true}).waitFor();
  await dialog.getByRole("button",{name:"OK",exact:true}).click();
  try { await dialog.waitFor({state:"hidden",timeout:5000}); }
  catch {
    console.log("Submit response", await page.locator('.el-message-box:visible, .el-message:visible, .ivu-message:visible').allInnerTexts());
    await page.screenshot({path:".data/connection-check/volume-submit.png"});
    console.log("Form stayed open; checking freshly reloaded device state.");
  }
  const deadline=Date.now()+45000;
  while (Date.now()<deadline) {
    const after = await readDevice(page,externalId);
    if (after.volume === volume) return after;
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  throw new Error("Volume read-back differs after waiting for device report; result unknown");
}
