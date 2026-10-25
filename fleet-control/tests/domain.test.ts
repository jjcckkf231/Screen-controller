import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankProgram,
  groupDescendants,
  newLayer,
  nextPowerEvents,
  powerScheduleSchema,
  programInputSchema,
} from "../shared/domain.ts";
import { encryptJson, decryptJson } from "../server/secrets.ts";
import { randomBytes } from "node:crypto";
import { connectorConfigSchema } from "../worker/config.ts";

test("overnight power periods produce the following-day off event in Bangkok", () => {
  const events = nextPowerEvents(
    {
      enabled: true,
      timezone: "Asia/Bangkok",
      rules: [{ days: [1], on: "22:00", off: "06:00" }],
    },
    new Date("2026-10-26T16:00:00Z"),
  );
  assert.deepEqual(events[0], { state: "off", at: "2026-10-26T23:00:00Z" });
});
test("weekly overlap includes Sunday rollover and duplicate days", () => {
  assert.equal(
    powerScheduleSchema.safeParse({
      enabled: true,
      timezone: "Asia/Bangkok",
      rules: [
        { days: [7], on: "23:00", off: "03:00" },
        { days: [1], on: "02:00", off: "05:00" },
      ],
    }).success,
    false,
  );
  assert.equal(
    powerScheduleSchema.safeParse({
      enabled: true,
      timezone: "Asia/Bangkok",
      rules: [{ days: [1, 1], on: "09:00", off: "10:00" }],
    }).success,
    false,
  );
});
test("disabled schedule has no events; invalid timezones and identical times rejected", () => {
  assert.deepEqual(
    nextPowerEvents({ enabled: false, timezone: "Asia/Bangkok", rules: [] }),
    [],
  );
  assert.equal(
    powerScheduleSchema.safeParse({
      enabled: true,
      timezone: "not-a-zone",
      rules: [],
    }).success,
    false,
  );
  assert.equal(
    powerScheduleSchema.safeParse({
      enabled: true,
      timezone: "UTC",
      rules: [{ days: [1], on: "01:00", off: "01:00" }],
    }).success,
    false,
  );
});
test("DST scheduling uses wall-clock time in the selected timezone", () => {
  const events = nextPowerEvents(
    {
      enabled: true,
      timezone: "America/New_York",
      rules: [{ days: [7], on: "09:00", off: "18:00" }],
    },
    new Date("2026-11-01T00:00:00Z"),
  );
  assert.equal(events[0].at, "2026-11-01T14:00:00Z");
});
test("layout rejects out-of-bounds and duplicate layers", () => {
  const p = blankProgram("Menu", 1080, 1920),
    l = newLayer("text", p.screens[0]);
  p.screens[0].layers = [l, { ...l }];
  assert.equal(programInputSchema.safeParse(p).success, false);
  p.screens[0].layers = [{ ...l, x: 1080 }];
  assert.equal(programInputSchema.safeParse(p).success, false);
});
test("group traversal includes descendants and does not loop on corrupt cycles", () => {
  assert.deepEqual(
    new Set(
      groupDescendants(
        [
          { id: "a", name: "A", parentId: "b", version: 1 },
          { id: "b", name: "B", parentId: "a", version: 1 },
        ],
        "a",
      ),
    ),
    new Set(["a", "b"]),
  );
});
test("encrypted authentication state round trips and rejects the wrong key", () => {
  const key = randomBytes(32).toString("base64"),
    value = { cookies: [{ name: "test", value: "secret" }] };
  const sealed = encryptJson(value, key);
  assert(!sealed.includes("secret"));
  assert.deepEqual(decryptJson(sealed, key), value);
  assert.throws(() => decryptJson(sealed, randomBytes(32).toString("base64")));
});
test("connector config cannot turn verification into writes or use another origin", () => {
  const config = {
    origin: "https://www.led-cloud.com",
    accountSelector: "[data-account]",
    expectedAccount: "test",
    workflows: {
      publish_program: {
        commissioned: true,
        revision: "1",
        steps: [{ action: "click", selector: "button" }],
        verify: [{ action: "click", selector: "button" }],
      },
    },
  };
  assert.equal(connectorConfigSchema.safeParse(config).success, false);
  assert.equal(
    connectorConfigSchema.safeParse({
      ...config,
      origin: "https://example.com",
      workflows: {},
    }).success,
    false,
  );
});
