import { z } from "zod";
import { commands } from "../shared/domain.ts";
export const locatorSchema = z.object({
  selector: z.string().min(1).max(1000),
});
// Selectors must be recorded against the authorized test account during commissioning.
// This format deliberately cannot execute injected JavaScript or arbitrary shell commands.
export const stepSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("goto"),
    path: z.string().startsWith("/").max(300),
  }),
  z.object({
    action: z.literal("click"),
    selector: z.string().max(1000),
    write: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("fill"),
    selector: z.string().max(1000),
    value: z.string().max(20000),
  }),
  z.object({
    action: z.literal("check"),
    selector: z.string().max(1000),
    checked: z.boolean(),
  }),
  z.object({
    action: z.literal("select"),
    selector: z.string().max(1000),
    value: z.string().max(200),
  }),
  z.object({
    action: z.literal("upload"),
    selector: z.string().max(1000),
    mediaId: z.string().max(200),
  }),
  z.object({
    action: z.literal("assert_text"),
    selector: z.string().max(1000),
    equals: z.string().max(20000),
  }),
  z.object({
    action: z.literal("assert_value"),
    selector: z.string().max(1000),
    equals: z.string().max(20000),
  }),
]);
const workflowSchema = z
  .object({
    commissioned: z.boolean().default(false),
    revision: z.string().min(1),
    perDevice: z.boolean().default(true),
    steps: z.array(stepSchema).min(1).max(200),
    verify: z.array(stepSchema).min(1).max(50),
  })
  .superRefine((w, ctx) => {
    if (
      w.verify.some(
        (s) => !["goto", "assert_text", "assert_value"].includes(s.action),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Verification must be read-only assertions/navigation.",
      });
    if (!w.verify.some((s) => s.action.startsWith("assert_")))
      ctx.addIssue({
        code: "custom",
        message: "At least one explicit postcondition is required.",
      });
  });
const readField = z.object({
  selector: z.string().min(1).max(1000),
  attribute: z.string().max(80).optional(),
  format: z
    .enum(["text", "resolution_width", "resolution_height"])
    .default("text"),
});
export const fleetReadSchema = z.object({
  commissioned: z.boolean().default(false),
  revision: z.string().min(1),
  path: z.string().startsWith("/"),
  rowSelector: z.string().min(1).max(1000),
  totalSelector: z.string().min(1).max(1000),
  totalFormat: z.enum(["integer", "xiaohui_english"]).default("integer"),
  minimumDeviceCount: z.number().int().min(0).max(500).default(0),
  nextPageSelector: z.string().min(1).max(1000).optional(),
  maxPages: z.number().int().min(1).max(100).default(50),
  fields: z.object({
    externalId: readField,
    name: readField,
    online: readField.optional(),
    width: readField.optional(),
    height: readField.optional(),
    groupId: readField.optional(),
    groupName: readField.optional(),
    brightness: readField.optional(),
    volume: readField.optional(),
    rotation: readField.optional(),
    power: readField.optional(),
    timezone: readField.optional(),
    firmware: readField.optional(),
    programName: readField.optional(),
    powerScheduleJson: readField.optional(),
  }),
  onlineValues: z.array(z.string()).default(["Online"]),
  offlineValues: z.array(z.string()).default(["Offline"]),
  onValues: z.array(z.string()).default(["On"]),
  offValues: z.array(z.string()).default(["Off"]),
  deviceCapabilities: z
    .array(
      z.enum([
        "power_schedule",
        "brightness",
        "volume",
        "rotation",
        "power",
        "restart",
        "screenshot",
      ]),
    )
    .default([]),
});
export const connectorConfigSchema = z.object({
  nativeVolume: z
    .object({
      commissioned: z.boolean().default(false),
      revision: z.string().min(1),
      deviceIds: z.array(z.string().min(1)).max(5),
    })
    .optional(),
  // Accepted for old configuration files; fleet status reads now include every discovered device.
  detailDeviceIds: z.array(z.string().min(1)).max(500).default([]),
  origin: z.literal("https://www.led-cloud.com"),
  accountSelector: z.string().min(1).max(1000),
  expectedAccount: z.string().min(1).max(200),
  entryPath: z.string().startsWith("/").default("/#/Rich/DeviceManage"),
  fleetRead: fleetReadSchema.optional(),
  workflows: z.partialRecord(z.enum(commands), workflowSchema).default({}),
});
export type ConnectorConfig = z.infer<typeof connectorConfigSchema>;
