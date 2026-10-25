import { test, expect } from "@playwright/test";
import type { FleetState } from "../../shared/domain";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=",
  "base64",
);
test("complete bilingual workflow with real server, database, uploads and worker", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Make this workspace yours" }),
  ).toBeVisible();
  await page.getByLabel("Your name").fill("Acceptance owner");
  await page
    .getByLabel("Email", { exact: true })
    .fill("acceptance@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("acceptance-test-passphrase");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "All screens", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No fleet connected", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/01-empty-fleet.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Media library", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "test-image.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(
    page.getByRole("button", { name: /test-image.png/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /test-image.png/ }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sync to Xiaohui" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close / ปิด" }).click();
  await page.getByRole("button", { name: "Programs", exact: true }).click();
  await page.getByRole("button", { name: "New program", exact: true }).click();
  await page.getByLabel("Program name", { exact: true }).fill("Weekend menu");
  await page
    .getByRole("button", { name: "Create program", exact: true })
    .click();
  await page.getByRole("button", { name: "Image", exact: true }).click();
  await page.getByRole("button", { name: /test-image.png/ }).click();
  await page.getByRole("button", { name: "Add selected", exact: true }).click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Text content", exact: true })
    .fill("Weekend specials\nเมนูสุดสัปดาห์");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText(/Draft saved · v2/)).toBeVisible();
  await page.screenshot({
    path: "test-results/02-program-editor.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Draft preview" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close / ปิด" }).click();
  await page.getByRole("button", { name: "Program actions" }).click();
  await page
    .getByRole("button", { name: "Clear program content", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Clear draft content", exact: true })
    .click();
  await expect(
    page.getByText("No layers yet. Add your first image, video or text."),
  ).toBeVisible();
  let data = await page.request.get("/api/state");
  let s = (await data.json()) as FleetState;
  expect(s.media).toHaveLength(1);
  expect(s.programs[0].screens[0].width).toBe(1080);
  expect(s.programs[0].screens[0].layers).toHaveLength(0);
  await page
    .getByRole("button", { name: "Version history", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Restore draft", exact: true })
    .nth(1)
    .click();
  await expect(
    page.getByText("No layers yet. Add your first image, video or text."),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Start training workspace", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create training fleet", exact: true })
    .click();
  await expect(
    page.getByText("Training workspace active", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Screens 6", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Siam · Screen 1, show settings" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Siam · Screen 1, show settings" })
    .hover();
  await expect(page.getByRole("tooltip")).toContainText("Brightness");
  await expect(page.getByRole("tooltip")).toContainText("70%");
  await page.getByRole("heading", { name: "All screens" }).hover();
  await page.screenshot({
    path: "test-results/03-training-fleet.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("Test branch");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Test branch 0", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await page
    .getByRole("checkbox", { name: "Select Siam · Screen 1", exact: true })
    .check();
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await page
    .getByLabel("Destination group")
    .selectOption({ label: "Test branch" });
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect
    .poll(async () => {
      const r = await page.request.get("/api/state");
      const state = (await r.json()) as FleetState;
      return state.groups.find(
        (g) =>
          g.id ===
          state.devices.find((d) => d.id === "training-screen-1")?.groupId,
      )?.name;
    })
    .toBe("Test branch");
  await page
    .getByRole("button", { name: "Power schedule", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("On", { exact: true })
    .fill("22:00");
  await page
    .getByRole("dialog")
    .getByLabel("Off", { exact: true })
    .fill("06:00");
  await expect(page.getByText("Switches off the following day.")).toBeVisible();
  await page.screenshot({
    path: "test-results/04-power-schedule.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Apply to selected screens", exact: true })
    .click();
  await expect
    .poll(async () => {
      const r = await page.request.get("/api/state");
      const state = (await r.json()) as FleetState;
      return state.devices.find((d) => d.id === "training-screen-1")!.settings
        .powerSchedule?.rules[0].on;
    })
    .toBe("22:00");
  await page
    .getByRole("checkbox", { name: "Select Siam · Screen 2", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Power schedule", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Apply to selected screens",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "Replace the mixed schedules with this shared schedule",
      exact: true,
    })
    .check();
  await expect(
    page.getByRole("button", {
      name: "Apply to selected screens",
      exact: true,
    }),
  ).toBeEnabled();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.getByRole("button", { name: "Programs", exact: true }).click();
  await page.getByRole("button", { name: /Weekend menu 1080/ }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("checkbox", { name: /Siam · Screen 1/ })
    .check();
  await page
    .getByRole("button", { name: "Confirm publish", exact: true })
    .click();
  await expect
    .poll(async () => {
      const r = await page.request.get("/api/state");
      const state = (await r.json()) as FleetState;
      return state.devices.find((d) => d.id === "training-screen-1")!.settings
        .programName;
    })
    .toBe("Weekend menu");
  await page
    .locator(".quick-widgets")
    .getByRole("button", { name: "Text", exact: true })
    .click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeDisabled();
  await page
    .locator(".quick-widgets")
    .getByRole("button", { name: "Text", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Media library", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Leave without saving?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Discard unsaved changes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Media library", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ภาษาไทย", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "คลังสื่อ", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/05-thai-interface.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page
    .getByRole("button", { name: /Activity/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Activity", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Publish program", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/06-activity.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "All screens", exact: true }),
  ).toBeVisible();
});
