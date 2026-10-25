import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";

export const roles = [
  "owner",
  "editor",
  "operator",
  "reviewer",
  "viewer",
] as const;
export type Role = (typeof roles)[number];
export type Mode = "disconnected" | "training" | "xiaohui";
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  groupIds: string[];
}
export interface Group {
  id: string;
  name: string;
  parentId: string | null;
  externalId?: string;
  version: number;
}
export interface PowerRule {
  days: number[];
  on: string;
  off: string;
}
export interface PowerSchedule {
  enabled: boolean;
  timezone: string;
  rules: PowerRule[];
}
export interface ScreenSettings {
  brightness: number | null;
  volume: number | null;
  rotation: number | null;
  power: "on" | "off" | "unknown";
  width: number;
  height: number;
  programId: string | null;
  programName: string | null;
  programVersion?: number | null;
  powerSchedule: PowerSchedule | null;
  firmware?: string | null;
  timezone: string | null;
  observedAt: string | null;
  source: string;
}
export interface Device {
  id: string;
  externalId: string;
  name: string;
  groupId: string | null;
  online: boolean | null;
  settings: ScreenSettings;
  desiredSchedule?: PowerSchedule;
  scheduleStatus?: "pending" | "verified" | "failed" | "unknown";
  capabilities: string[];
  version: number;
  lastSeenAt: string | null;
  assignedPrograms?: { id: string; name: string; version: number }[];
}
export const widgetTypes = [
  "image",
  "video",
  "text",
  "clock",
  "mixed",
  "html",
  "weather",
  "stream",
  "timer",
  "qr",
  "button",
  "document",
  "hdmi",
  "plugin",
] as const;
export interface Layer {
  id: string;
  name: string;
  type: (typeof widgetTypes)[number];
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  hidden: boolean;
  locked: boolean;
  mediaIds: string[];
  duration: number;
  fit: "contain" | "cover" | "fill";
  volume: number;
  text: string;
  fontSize: number;
  color: string;
  background: string;
  config: Record<string, unknown>;
}
export interface ScreenLayout {
  id: string;
  name: string;
  width: number;
  height: number;
  background: string;
  layers: Layer[];
}
export interface PlaybackSchedule {
  timezone: string;
  days: number[];
  startDate: string | null;
  endDate: string | null;
  startTime: string;
  endTime: string;
}
export interface Program {
  id: string;
  name: string;
  type:
    | "ordinary"
    | "multi-screen"
    | "soft-splicing"
    | "h5"
    | "full-color"
    | "single-color";
  screens: ScreenLayout[];
  version: number;
  status: "draft" | "submitted" | "approved";
  tags: string[];
  updatedAt: string;
  deletedAt?: string;
  schedule: PlaybackSchedule | null;
  externalId?: string;
  lastPublishedVersion?: number;
  submittedVersion?: number;
}
export interface Media {
  id: string;
  name: string;
  type: "image" | "video" | "audio" | "document";
  mime: string;
  size: number;
  checksum: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  group: string;
  review: "pending" | "approved" | "rejected";
  createdAt: string;
  externalId?: string;
  version: number;
}
export interface Playlist {
  id: string;
  name: string;
  programIds: string[];
  deviceIds: string[];
  version: number;
}
export type JobState =
  | "awaiting_approval"
  | "queued"
  | "running"
  | "verifying"
  | "succeeded"
  | "partial"
  | "failed"
  | "needs_human"
  | "result_unknown"
  | "cancelled";
export const commands = [
  "sync_fleet",
  "refresh_device",
  "create_group",
  "rename_group",
  "move_devices",
  "rename_device",
  "upload_media",
  "sync_program",
  "publish_program",
  "remove_program",
  "set_power_schedule",
  "device_control",
  "publish_playlist",
] as const;
export type Command = (typeof commands)[number];
export interface TargetResult {
  id: string;
  state: "succeeded" | "failed" | "unknown" | "pending";
  message: string;
  evidence?: Record<string, unknown>;
}
export interface Job {
  id: string;
  command: Command;
  state: JobState;
  payload: Record<string, unknown>;
  targetIds: string[];
  results: TargetResult[];
  error: string | null;
  requestedBy: string;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string;
  mode: Mode;
  attempts: number;
  workerId: string | null;
  leaseUntil: string | null;
}
export interface Audit {
  id: string;
  actor: string;
  action: string;
  target: string;
  details: Record<string, unknown>;
  createdAt: string;
}
export interface Connection {
  mode: Mode;
  paused: boolean;
  accountLabel: string;
  verifiedAccount: string | null;
  allowedDeviceIds: string[];
  maxTargets: number;
  requirePublishApproval: boolean;
  capabilities: string[];
  lastSyncAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  workerLastSeenAt: string | null;
}
export interface FleetState {
  user: User;
  groups: Group[];
  devices: Device[];
  programs: Program[];
  publishedPrograms: Program[];
  media: Media[];
  playlists: Playlist[];
  jobs: Job[];
  audit: Audit[];
  connection: Connection;
}

export const idSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const nameSchema = z.string().trim().min(1).max(120);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const timezoneSchema = z
  .string()
  .max(80)
  .refine((s) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: s });
      return true;
    } catch {
      return false;
    }
  }, "Invalid timezone");
export const powerScheduleSchema = z
  .object({
    enabled: z.boolean(),
    timezone: timezoneSchema,
    rules: z
      .array(
        z.object({
          days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
          on: timeSchema,
          off: timeSchema,
        }),
      )
      .max(14),
  })
  .superRefine((s, ctx) => {
    if (s.enabled && !s.rules.length)
      ctx.addIssue({
        code: "custom",
        message: "Choose at least one power period.",
      });
    const slots = new Set<number>();
    for (const r of s.rules) {
      if (r.on === r.off) {
        ctx.addIssue({
          code: "custom",
          message: "On and off times must differ.",
        });
        continue;
      }
      if (new Set(r.days).size !== r.days.length)
        ctx.addIssue({ code: "custom", message: "Duplicate weekday." });
      const a = minutes(r.on),
        b = minutes(r.off),
        length = b > a ? b - a : 1440 - a + b;
      for (const day of r.days)
        for (let i = 0; i < length; i++) {
          const m = ((day - 1) * 1440 + a + i) % 10080;
          if (slots.has(m)) {
            ctx.addIssue({ code: "custom", message: "Power periods overlap." });
            return;
          }
          slots.add(m);
        }
    }
  });
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const layerSchema = z.object({
  id: idSchema,
  name: nameSchema,
  type: z.enum(widgetTypes),
  x: z.number().finite().min(0),
  y: z.number().finite().min(0),
  width: z.number().finite().min(1).max(16384),
  height: z.number().finite().min(1).max(16384),
  rotation: z.number().min(-360).max(360),
  opacity: z.number().min(0).max(1),
  hidden: z.boolean(),
  locked: z.boolean(),
  mediaIds: z.array(idSchema).max(200),
  duration: z.number().min(0.1).max(86400),
  fit: z.enum(["contain", "cover", "fill"]),
  volume: z.number().min(0).max(100),
  text: z.string().max(20000),
  fontSize: z.number().min(8).max(1000),
  color: hex,
  background: hex,
  config: z.record(z.string(), z.unknown()),
});
export const screenSchema = z
  .object({
    id: idSchema,
    name: nameSchema,
    width: z.number().int().min(64).max(16384),
    height: z.number().int().min(64).max(16384),
    background: hex,
    layers: z.array(layerSchema).max(100),
  })
  .superRefine((s, ctx) => {
    if (new Set(s.layers.map((l) => l.id)).size !== s.layers.length)
      ctx.addIssue({ code: "custom", message: "Duplicate layer IDs." });
    for (const l of s.layers)
      if (l.x + l.width > s.width + 0.01 || l.y + l.height > s.height + 0.01)
        ctx.addIssue({
          code: "custom",
          message: `Layer ${l.name} extends beyond the screen.`,
        });
  });
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    try {
      Temporal.PlainDate.from(s);
      return true;
    } catch {
      return false;
    }
  });
export const playbackSchema = z
  .object({
    timezone: timezoneSchema,
    days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    startDate: dateSchema.nullable(),
    endDate: dateSchema.nullable(),
    startTime: timeSchema,
    endTime: timeSchema,
  })
  .refine(
    (s) => !s.startDate || !s.endDate || s.startDate <= s.endDate,
    "End date precedes start date.",
  );
export const programInputSchema = z
  .object({
    name: nameSchema,
    type: z.enum([
      "ordinary",
      "multi-screen",
      "soft-splicing",
      "h5",
      "full-color",
      "single-color",
    ]),
    screens: z.array(screenSchema).min(1).max(16),
    tags: z.array(z.string().max(40)).max(20),
    schedule: playbackSchema.nullable(),
  })
  .superRefine((p, ctx) => {
    if (new Set(p.screens.map((s) => s.id)).size !== p.screens.length)
      ctx.addIssue({ code: "custom", message: "Duplicate screen IDs." });
    if (p.type === "ordinary" && p.screens.length !== 1)
      ctx.addIssue({
        code: "custom",
        message: "Use multi-screen for multiple screens.",
      });
  });
export function minutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function nextPowerEvents(
  schedule: PowerSchedule | null,
  now = new Date(),
): { state: "on" | "off"; at: string }[] {
  if (!schedule?.enabled) return [];
  const today = Temporal.Instant.from(now.toISOString())
    .toZonedDateTimeISO(schedule.timezone)
    .toPlainDate();
  const found: { state: "on" | "off"; at: string }[] = [];
  for (let offset = -1; offset <= 8; offset++) {
    const date = today.add({ days: offset });
    for (const r of schedule.rules)
      if (r.days.includes(date.dayOfWeek)) {
        for (const state of ["on", "off"] as const) {
          const d =
            state === "off" && minutes(r.off) < minutes(r.on)
              ? date.add({ days: 1 })
              : date;
          const [hour, minute] = r[state].split(":").map(Number);
          const zoned = Temporal.ZonedDateTime.from({
            timeZone: schedule.timezone,
            year: d.year,
            month: d.month,
            day: d.day,
            hour,
            minute,
          });
          if (zoned.epochMilliseconds > now.getTime())
            found.push({ state, at: zoned.toInstant().toString() });
        }
      }
  }
  return found.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(0, 4);
}
export function groupDescendants(groups: Group[], id: string): string[] {
  const seen = new Set<string>();
  const pending = [id];
  while (pending.length) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    pending.push(
      ...groups.filter((g) => g.parentId === current).map((g) => g.id),
    );
  }
  return [...seen];
}
export function blankProgram(
  name: string,
  width = 1080,
  height = 1920,
): Omit<Program, "id" | "version" | "updatedAt" | "status"> {
  return {
    name,
    type: "ordinary",
    tags: [],
    schedule: null,
    screens: [
      {
        id: crypto.randomUUID(),
        name: "Screen 1",
        width,
        height,
        background: "#ffffff",
        layers: [],
      },
    ],
  };
}
export function newLayer(type: Layer["type"], screen: ScreenLayout): Layer {
  return {
    id: crypto.randomUUID(),
    name: type[0].toUpperCase() + type.slice(1),
    type,
    x: 0,
    y: 0,
    width: screen.width,
    height:
      type === "text" || type === "clock"
        ? Math.min(220, screen.height)
        : screen.height,
    rotation: 0,
    opacity: 1,
    hidden: false,
    locked: false,
    mediaIds: [],
    duration: 5,
    fit: "contain",
    volume: 50,
    text: type === "text" ? "Your message / ข้อความของคุณ" : "",
    fontSize: 64,
    color: "#202020",
    background: "#ffffff",
    config: {},
  };
}
