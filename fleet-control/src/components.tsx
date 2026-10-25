import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  X,
  Monitor,
  Image as ImageIcon,
  Film,
  FileText,
  Clock,
  Layers,
  Plus,
  Trash2,
} from "lucide-react";
import type {
  Media,
  PowerSchedule,
  Program,
  ScreenLayout,
} from "../shared/domain";
import { nextPowerEvents, powerScheduleSchema } from "../shared/domain";
import { Field, formatDate, useFleet } from "./context";

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current!;
    d.showModal();
    return () => {
      if (d.open) d.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={wide ? "modal wide" : "modal"}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={title}
    >
      <header>
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close / ปิด"
        >
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Empty({
  title,
  text,
  action,
  icon,
}: {
  title: string;
  text: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon ?? <Monitor size={28} />}</div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function MediaThumbnail({
  media,
  controls = false,
}: {
  media: Media;
  controls?: boolean;
}) {
  const src = `/api/media/${media.id}/file`;
  return media.type === "image" ? (
    <img src={src} alt={media.name} loading="lazy" />
  ) : media.type === "video" ? (
    <video src={src} preload="metadata" controls={controls} muted={!controls} />
  ) : (
    <div className="file-placeholder">
      {media.type === "document" ? <FileText /> : <Film />}
      <span>{media.mime}</span>
    </div>
  );
}
export function LayoutPreview({
  layout,
  media,
  playing = false,
}: {
  layout: ScreenLayout;
  media: Media[];
  playing?: boolean;
}) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [playing]);
  return (
    <div
      className="layout-preview"
      style={{
        aspectRatio: `${layout.width}/${layout.height}`,
        background: layout.background,
      }}
    >
      {layout.layers
        .filter((l) => !l.hidden)
        .map((layer) => {
          const index = playing
            ? Math.floor(seconds / layer.duration) %
              Math.max(1, layer.mediaIds.length)
            : 0;
          const asset = media.find((m) => m.id === layer.mediaIds[index]);
          return (
            <div
              key={layer.id}
              className="preview-layer"
              style={{
                left: `${(layer.x / layout.width) * 100}%`,
                top: `${(layer.y / layout.height) * 100}%`,
                width: `${(layer.width / layout.width) * 100}%`,
                height: `${(layer.height / layout.height) * 100}%`,
                transform: `rotate(${layer.rotation}deg)`,
                opacity: layer.opacity,
                color: layer.color,
                background: ["text", "clock"].includes(layer.type)
                  ? layer.background
                  : undefined,
                fontSize: `${(layer.fontSize / layout.width) * 100}cqw`,
              }}
            >
              {asset && ["image", "mixed", "video"].includes(layer.type) ? (
                asset.type === "video" ? (
                  <video
                    key={asset.id}
                    src={`/api/media/${asset.id}/file`}
                    autoPlay={playing}
                    muted
                    loop
                    playsInline
                    style={{ objectFit: layer.fit }}
                  />
                ) : (
                  <img
                    src={`/api/media/${asset.id}/file`}
                    alt=""
                    style={{ objectFit: layer.fit }}
                  />
                )
              ) : layer.type === "text" ? (
                layer.text
              ) : layer.type === "clock" ? (
                new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              ) : (
                <div className="widget-placeholder">
                  <Layers size={20} />
                  <span>{layer.name}</span>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
export function ProgramThumb({
  program,
  media,
}: {
  program?: Program;
  media: Media[];
}) {
  return (
    <div className="program-thumb">
      {program ? (
        <LayoutPreview layout={program.screens[0]} media={media} />
      ) : (
        <div className="screen-unassigned">
          <Monitor size={22} />
          <span>—</span>
        </div>
      )}
    </div>
  );
}
export function PowerEditor({
  initial,
  onSave,
  onClose,
  targets,
  targetNames = [],
  mixed = false,
}: {
  initial?: PowerSchedule | null;
  onSave: (s: PowerSchedule) => Promise<void>;
  onClose: () => void;
  targets: number;
  targetNames?: { name: string; externalId: string }[];
  mixed?: boolean;
}) {
  const { t, lang } = useFleet();
  const [schedule, setSchedule] = useState<PowerSchedule>(
    structuredClone(
      initial ?? {
        enabled: true,
        timezone: "Asia/Bangkok",
        rules: [{ days: [1, 2, 3, 4, 5, 6, 7], on: "09:00", off: "22:00" }],
      },
    ),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [replaceMixed, setReplaceMixed] = useState(false);
  const days =
    lang === "en"
      ? ["M", "T", "W", "T", "F", "S", "S"]
      : ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
  const parsed = powerScheduleSchema.safeParse(schedule),
    events = parsed.success ? nextPowerEvents(schedule) : [];
  return (
    <Modal
      title={t("Power schedule", "ตารางเปิด–ปิดจอ")}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (mixed && !replaceMixed) return;
          setError("");
          if (!parsed.success) {
            setError(parsed.error.issues.map((i) => i.message).join(" "));
            return;
          }
          setBusy(true);
          try {
            await onSave(schedule);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <div className="notice">
            {t(
              `This replaces the power schedule on ${targets} selected screen(s). Playback content is unchanged.`,
              `จะแทนที่ตารางเปิด–ปิดของจอที่เลือก ${targets} จอ โดยไม่เปลี่ยนเนื้อหา`,
            )}
          </div>
          <div className="target-list">
            <strong>
              {t("Exact target screens", "หน้าจอที่จะได้รับคำสั่ง")}
            </strong>
            <div>
              {targetNames.map((d) => (
                <span key={d.externalId}>
                  {d.name}
                  <small>{d.externalId}</small>
                </span>
              ))}
            </div>
          </div>
          {mixed && (
            <div className="notice warning">
              <p>
                {t(
                  "These screens have different or unknown schedules. The form below is a new shared schedule, not their current value.",
                  "จอเหล่านี้มีตารางเวลาต่างกันหรือไม่ทราบค่า แบบฟอร์มด้านล่างเป็นตารางใหม่ร่วมกัน ไม่ใช่ค่าปัจจุบัน",
                )}
              </p>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={replaceMixed}
                  onChange={(e) => setReplaceMixed(e.target.checked)}
                />
                {t(
                  "Replace the mixed schedules with this shared schedule",
                  "แทนที่ตารางเวลาที่ต่างกันด้วยตารางใหม่นี้",
                )}
              </label>
            </div>
          )}
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={schedule.enabled}
              onChange={(e) =>
                setSchedule({ ...schedule, enabled: e.target.checked })
              }
            />
            {t("Enable automatic on/off", "เปิดใช้การเปิด–ปิดอัตโนมัติ")}
          </label>
          <Field label={t("Timezone", "เขตเวลา")}>
            <select
              value={schedule.timezone}
              onChange={(e) =>
                setSchedule({ ...schedule, timezone: e.target.value })
              }
            >
              {[
                "Asia/Bangkok",
                "Asia/Shanghai",
                "Asia/Singapore",
                "Asia/Tokyo",
                "Europe/London",
                "America/New_York",
                "UTC",
                schedule.timezone,
              ]
                .filter((x, i, a) => a.indexOf(x) === i)
                .map((tz) => (
                  <option key={tz}>{tz}</option>
                ))}
            </select>
          </Field>
          <div className="rule-list">
            {schedule.rules.map((rule, index) => (
              <div className="power-rule" key={index}>
                <div className="weekdays">
                  {days.map((day, i) => (
                    <button
                      type="button"
                      key={i}
                      className={rule.days.includes(i + 1) ? "selected" : ""}
                      aria-pressed={rule.days.includes(i + 1)}
                      aria-label={`${t("Day", "วัน")} ${i + 1}`}
                      onClick={() =>
                        setSchedule({
                          ...schedule,
                          rules: schedule.rules.map((r, j) =>
                            j === index
                              ? {
                                  ...r,
                                  days: r.days.includes(i + 1)
                                    ? r.days.filter((d) => d !== i + 1)
                                    : [...r.days, i + 1].sort(),
                                }
                              : r,
                          ),
                        })
                      }
                    >
                      {day}
                    </button>
                  ))}
                </div>
                <div className="inline">
                  <Field label={t("On", "เปิด")}>
                    <input
                      type="time"
                      value={rule.on}
                      onChange={(e) =>
                        setSchedule({
                          ...schedule,
                          rules: schedule.rules.map((r, j) =>
                            j === index ? { ...r, on: e.target.value } : r,
                          ),
                        })
                      }
                      required
                    />
                  </Field>
                  <span>→</span>
                  <Field label={t("Off", "ปิด")}>
                    <input
                      type="time"
                      value={rule.off}
                      onChange={(e) =>
                        setSchedule({
                          ...schedule,
                          rules: schedule.rules.map((r, j) =>
                            j === index ? { ...r, off: e.target.value } : r,
                          ),
                        })
                      }
                      required
                    />
                  </Field>
                  <button
                    className="icon-button danger-text"
                    type="button"
                    aria-label={t("Remove period", "ลบช่วงเวลา")}
                    onClick={() =>
                      setSchedule({
                        ...schedule,
                        rules: schedule.rules.filter((_, j) => j !== index),
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {rule.off < rule.on && (
                  <small>
                    {t("Switches off the following day.", "ปิดจอในวันถัดไป")}
                  </small>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="button subtle"
            onClick={() =>
              setSchedule({
                ...schedule,
                rules: [
                  ...schedule.rules,
                  { days: [1], on: "09:00", off: "18:00" },
                ],
              })
            }
            disabled={schedule.rules.length >= 14}
          >
            <Plus size={15} />
            {t("Add period", "เพิ่มช่วงเวลา")}
          </button>
          {events.length > 0 && (
            <div className="next-events">
              <h3>{t("Next changes", "การเปลี่ยนแปลงถัดไป")}</h3>
              {events.slice(0, 2).map((event, i) => (
                <span key={i}>
                  <Clock size={14} />
                  {event.state === "on"
                    ? t("On", "เปิด")
                    : t("Off", "ปิด")} ·{" "}
                  {new Date(event.at).toLocaleString(
                    lang === "th" ? "th-TH-u-ca-gregory" : "en-GB",
                    {
                      timeZone: schedule.timezone,
                      dateStyle: "medium",
                      timeStyle: "short",
                    },
                  )}
                </span>
              ))}
            </div>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer>
          <button type="button" className="button" onClick={onClose}>
            {t("Cancel", "ยกเลิก")}
          </button>
          <button
            className="button primary"
            disabled={busy || (mixed && !replaceMixed)}
          >
            {busy
              ? t("Queuing…", "กำลังเข้าคิว…")
              : t("Apply to selected screens", "ใช้กับจอที่เลือก")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function Confirm({
  title,
  description,
  label,
  onConfirm,
  onClose,
  danger = false,
}: {
  title: string;
  description: string;
  label: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  danger?: boolean;
}) {
  const { t } = useFleet();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={title} onClose={onClose}>
      <div className="modal-body">
        <p>{description}</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer>
        <button className="button" onClick={onClose}>
          {t("Cancel", "ยกเลิก")}
        </button>
        <button
          className={`button ${danger ? "danger" : "primary"}`}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? t("Working…", "กำลังทำงาน…") : label}
        </button>
      </footer>
    </Modal>
  );
}
