import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { connectorConfigSchema } from "../worker/config.ts";
import { readFleet } from "../worker/read-fleet.ts";

test("automatic status reads cover all pages and do not expand write capabilities", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(2000);
    // Synthetic UI only: intercept all requests; no real account or player is used.
    await page.route("**/*", (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `
      <span class="account">Fixture Account</span><span class="total">6</span>
      <div id="rows"></div><button class="next" onclick="index++;render()">Next</button>
      <div id="pane-otherData" hidden></div>
      <script>
      let index=0;
      function detail(id) {
        const pane=document.querySelector('#pane-otherData');pane.hidden=false;
        pane.innerHTML='<span>'+id+'</span>'+(id==='D6'?'':
          '<div class="item"><div class="title">Online Status：</div><div class="value">'+(id==='D2'?'Offline':'Online')+'</div></div>')+
          (id==='D3'?'':'<div class="item"><div class="title">Volume：</div><div class="value">75%</div></div>');
      }
      function render() {
        document.querySelector('#rows').innerHTML=[index*2+1,index*2+2].map(n=>
          '<div class="row"><span class="device-id">D'+n+'</span><span class="name">Screen '+n+'</span><button data-id="D'+n+'" onclick="detail(this.dataset.id)">Details</button></div>').join('');
        document.querySelector('.next').disabled=index===2;
      }render();
      </script>`,
      }),
    );
    const config = connectorConfigSchema.parse({
      origin: "https://www.led-cloud.com",
      accountSelector: ".account",
      expectedAccount: "Fixture Account",
      detailDeviceIds: ["D1"],
      nativeVolume: {
        commissioned: true,
        revision: "fixture",
        deviceIds: ["D2"],
      },
      fleetRead: {
        commissioned: true,
        revision: "fixture",
        path: "/#/Rich/DeviceManage",
        rowSelector: ".row",
        totalSelector: ".total",
        nextPageSelector: ".next:not(:disabled)",
        minimumDeviceCount: 1,
        fields: {
          externalId: { selector: ".device-id" },
          name: { selector: ".name" },
        },
      },
    });
    const events: string[] = [];
    const result = await readFleet(page, config, async (_step, detail) => {
      events.push(detail);
    });
    assert.equal(result.devices.length, 6);
    assert.deepEqual(
      result.devices.map((d) => d.online),
      [true, false, true, true, true, null],
    );
    assert.equal(
      result.devices[2].settings.volume,
      null,
      "missing volume must not hide online status",
    );
    assert.equal(
      result.devices[5].settings.observedAt,
      null,
      "failed read has no fresh observation timestamp",
    );
    assert.ok(
      result.devices[4].settings.observedAt,
      "later-page device has a timestamp",
    );
    assert.deepEqual(
      result.devices
        .filter((d) => d.capabilities.includes("volume"))
        .map((d) => d.externalId),
      ["D2"],
    );
    assert.ok(events.some((e) => e.includes("Unknown")));
    await assert.rejects(
      readFleet(
        page,
        { ...config, expectedAccount: "Different Account" },
        async () => {},
      ),
      /Account identity/,
    );
  } finally {
    await browser.close();
  }
});
