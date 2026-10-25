import { test } from "node:test";
import assert from "node:assert/strict";
import { totalCount, fieldValue } from "../worker/field-format.ts";
test("observed Xiaohui total and resolution formats", () => {
  assert.equal(totalCount("Total 15 Items", "xiaohui_english"), 15);
  assert.equal(totalCount("Total \n 15 \n Items", "xiaohui_english"), 15);
  assert.equal(fieldValue("1080x1920", "resolution_width"), "1080");
  assert.equal(fieldValue("1080x1920", "resolution_height"), "1920");
  assert.throws(() => totalCount("15 of 500", "xiaohui_english"));
  assert.throws(() => fieldValue("Unknown", "resolution_width"));
  assert.equal(fieldValue(null, "resolution_width"), null);
});
