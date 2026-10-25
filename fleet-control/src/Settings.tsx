import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Link,
  Users,
  Download,
  Pause,
  Play,
  ExternalLink,
  Plus,
  Search,
  ChevronRight,
  FlaskConical,
  Plug,
  FileText,
  CircleHelp,
} from "lucide-react";
import type { Job, User } from "../shared/domain";
import { api, Field, formatDate, useFleet } from "./context";
import { Badge, Confirm, Empty, Modal } from "./components";

export function ActivityPage() {
  const { state, t, lang, run } = useFleet();
  const [tab, setTab] = useState("jobs"),
    [filter, setFilter] = useState("all"),
    [focused, setFocused] = useState<string | null>(null),
    [events, setEvents] = useState<
      { step: string; detail: string; createdAt: string }[]
    >([]);
  const job = state.jobs.find((j) => j.id === focused),
    labels: Record<Job["state"], string> = {
      queued: t("Queued", "เข้าคิว"),
      running: t("Running", "กำลังทำงาน"),
      verifying: t("Verifying", "กำลังตรวจสอบ"),
      awaiting_approval: t("Needs approval", "รออนุมัติ"),
      succeeded: t("Verified", "ยืนยันแล้ว"),
      partial: t("Partly completed", "สำเร็จบางส่วน"),
      failed: t("Failed", "ไม่สำเร็จ"),
      needs_human: t("Needs attention", "ต้องตรวจสอบ"),
      result_unknown: t("Result unknown", "ไม่ทราบผล"),
      cancelled: t("Cancelled", "ยกเลิกแล้ว"),
    };
  const commandLabel = (command: string) =>
    (
      ({
        sync_fleet: t("Sync fleet", "ซิงค์กลุ่มจอ"),
        refresh_device: t("Refresh settings", "โหลดการตั้งค่า"),
        create_group: t("Create group", "สร้างกลุ่ม"),
        rename_group: t("Rename group", "เปลี่ยนชื่อกลุ่ม"),
        move_devices: t("Move screens", "ย้ายจอ"),
        rename_device: t("Rename screen", "เปลี่ยนชื่อจอ"),
        upload_media: t("Sync media", "ซิงค์สื่อ"),
        sync_program: t("Sync program", "ซิงค์โปรแกรม"),
        publish_program: t("Publish program", "เผยแพร่โปรแกรม"),
        publish_playlist: t("Publish playlist", "เผยแพร่เพลย์ลิสต์"),
        remove_program: t("Remove from screens", "นำออกจากจอ"),
        set_power_schedule: t("Set power schedule", "ตั้งเวลาเปิด–ปิด"),
        device_control: t("Screen control", "ควบคุมจอ"),
      }) as Record<string, string>
    )[command] ?? command;
  const jobs = state.jobs.filter(
    (j) =>
      filter === "all" ||
      (filter === "attention"
        ? ["failed", "partial", "needs_human", "result_unknown"].includes(
            j.state,
          )
        : filter === "active"
          ? ["queued", "running", "verifying", "awaiting_approval"].includes(
              j.state,
            )
          : j.state === "succeeded"),
  );
  const tone = (status: string) =>
    status === "succeeded"
      ? "green"
      : ["failed", "result_unknown"].includes(status)
        ? "red"
        : ["partial", "needs_human", "awaiting_approval"].includes(status)
          ? "amber"
          : "neutral";
  return (
    <div className="library-page">
      <header className="page-heading">
        <div>
          <div className="eyebrow">
            {t("KNOW WHAT ACTUALLY HAPPENED", "รู้ผลที่เกิดขึ้นจริง")}
          </div>
          <h1>{t("Activity", "กิจกรรม")}</h1>
          <p>
            {t(
              "Every operation, its targets and its verified result.",
              "ทุกคำสั่ง จอปลายทาง และผลการตรวจสอบ",
            )}
          </p>
        </div>
        <Badge>
          {state.jobs.length} {t("recent operations", "คำสั่งล่าสุด")}
        </Badge>
      </header>
      <div className="activity-stats">
        <div>
          <strong>
            {state.jobs.filter((j) => j.state === "succeeded").length}
          </strong>
          <span>{t("Verified jobs", "งานที่ยืนยันแล้ว")}</span>
        </div>
        <div>
          <strong>
            {
              state.jobs.filter((j) =>
                ["queued", "running", "verifying"].includes(j.state),
              ).length
            }
          </strong>
          <span>{t("In progress", "กำลังดำเนินการ")}</span>
        </div>
        <div>
          <strong>
            {
              state.jobs.filter((j) =>
                ["failed", "partial", "needs_human", "result_unknown"].includes(
                  j.state,
                ),
              ).length
            }
          </strong>
          <span>{t("Need attention", "ต้องตรวจสอบ")}</span>
        </div>
        <div>
          <strong>
            {state.jobs.filter((j) => j.state === "awaiting_approval").length}
          </strong>
          <span>{t("Awaiting approval", "รออนุมัติ")}</span>
        </div>
      </div>
      <div className="content-toolbar">
        <div className="segmented">
          <button
            className={tab === "jobs" ? "active" : ""}
            onClick={() => setTab("jobs")}
          >
            {t("Operations", "คำสั่ง")}
          </button>
          {state.user.role === "owner" && (
            <button
              className={tab === "audit" ? "active" : ""}
              onClick={() => setTab("audit")}
            >
              {t("Audit trail", "ประวัติการตรวจสอบ")}
            </button>
          )}
        </div>
        <span className="toolbar-spacer" />
        {tab === "jobs" && (
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">{t("All results", "ทุกผลลัพธ์")}</option>
            <option value="active">{t("In progress", "กำลังดำเนินการ")}</option>
            <option value="attention">
              {t("Need attention", "ต้องตรวจสอบ")}
            </option>
            <option value="verified">{t("Verified", "ยืนยันแล้ว")}</option>
          </select>
        )}
      </div>
      {tab === "audit" ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("Time", "เวลา")}</th>
                <th>{t("Action", "การกระทำ")}</th>
                <th>{t("Actor", "ผู้ดำเนินการ")}</th>
                <th>{t("Target", "เป้าหมาย")}</th>
              </tr>
            </thead>
            <tbody>
              {state.audit.map((a) => (
                <tr key={a.id}>
                  <td>{formatDate(a.createdAt, lang)}</td>
                  <td>{a.action}</td>
                  <td className="mono">
                    {a.actor === state.user.id ? t("You", "คุณ") : a.actor}
                  </td>
                  <td className="mono">{a.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : jobs.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("Operation", "คำสั่ง")}</th>
                <th>{t("Status", "สถานะ")}</th>
                <th>{t("Screens", "หน้าจอ")}</th>
                <th>{t("Requested", "สั่งเมื่อ")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td>
                    <strong>{commandLabel(j.command)}</strong>
                    <small className="table-sub">
                      {j.mode === "training"
                        ? t("Training provider", "ผู้ให้บริการจำลอง")
                        : j.mode}{" "}
                      · {j.id.slice(0, 8)}
                    </small>
                  </td>
                  <td>
                    <Badge tone={tone(j.state)}>{labels[j.state]}</Badge>
                  </td>
                  <td>
                    {j.results.filter((r) => r.state === "succeeded").length} /{" "}
                    {j.targetIds.length}
                  </td>
                  <td>{formatDate(j.createdAt, lang)}</td>
                  <td>
                    <button
                      className="button small-button"
                      onClick={() => {
                        setFocused(j.id);
                        void api<typeof events>(`/jobs/${j.id}/events`)
                          .then(setEvents)
                          .catch(() => setEvents([]));
                      }}
                    >
                      {t("Details", "รายละเอียด")}
                      <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={<Activity size={28} />}
          title={t(
            "A clear record of every action",
            "บันทึกทุกการทำงานอย่างชัดเจน",
          )}
          text={t(
            "Queued operations appear here. There are no hidden automatic retries after an uncertain write.",
            "คำสั่งที่เข้าคิวจะแสดงที่นี่ ระบบไม่ลองเขียนซ้ำอัตโนมัติเมื่อยังไม่ทราบผล",
          )}
        />
      )}
      {job && (
        <Modal
          title={commandLabel(job.command)}
          onClose={() => setFocused(null)}
          wide
        >
          <div className="modal-body">
            <div className="inline">
              <Badge tone={tone(job.state)}>{labels[job.state]}</Badge>
              <Badge>{job.mode}</Badge>
              <span className="mono micro">{job.id}</span>
            </div>
            {job.error && <p className="notice warning">{job.error}</p>}
            {job.state === "result_unknown" && (
              <div className="notice warning">
                {t(
                  "Do not blindly retry. Inspect the provider first, reconcile the actual state, then create a new operation only for targets that still need it.",
                  "อย่าลองซ้ำทันที ตรวจสอบสถานะจริงกับผู้ให้บริการก่อน แล้วสั่งใหม่เฉพาะจอที่ยังต้องดำเนินการ",
                )}
              </div>
            )}
            <dl className="settings-list">
              <div>
                <dt>{t("Requested", "สั่งเมื่อ")}</dt>
                <dd>{formatDate(job.createdAt, lang)}</dd>
              </div>
              <div>
                <dt>{t("Updated", "อัปเดต")}</dt>
                <dd>{formatDate(job.updatedAt, lang)}</dd>
              </div>
              <div>
                <dt>{t("Attempts", "จำนวนครั้ง")}</dt>
                <dd>{job.attempts}</dd>
              </div>
            </dl>
            <h3>{t("Frozen targets & results", "จอที่ล็อกไว้และผลลัพธ์")}</h3>
            <div className="job-results">
              {job.targetIds.map((id) => {
                const r = job.results.find((r) => r.id === id);
                return (
                  <div key={id}>
                    <strong>
                      {state.devices.find((d) => d.id === id)?.name ?? id}
                    </strong>
                    <Badge tone={tone(r?.state ?? "pending")}>
                      {r?.state ?? t("Pending", "รอดำเนินการ")}
                    </Badge>
                    <p>{r?.message ?? t("Not started.", "ยังไม่เริ่ม")}</p>
                  </div>
                );
              })}
            </div>
            <h3>{t("Worker events", "เหตุการณ์ตัวทำงาน")}</h3>
            <div className="event-log">
              {events.map((e, i) => (
                <div key={i}>
                  <span>{formatDate(e.createdAt, lang)}</span>
                  <strong>{e.step}</strong>
                  <p>{e.detail}</p>
                </div>
              ))}
            </div>
            <details>
              <summary>
                {t("Immutable request snapshot", "ข้อมูลคำสั่งที่ล็อกไว้")}
              </summary>
              <pre>{JSON.stringify(job.payload, null, 2)}</pre>
            </details>
          </div>
          <footer>
            {["queued", "awaiting_approval"].includes(job.state) &&
              (job.requestedBy === state.user.id ||
                state.user.role === "owner") && (
                <button
                  className="button danger-text"
                  onClick={() =>
                    run(() =>
                      api(`/jobs/${job.id}/action`, "POST", {
                        action: "cancel",
                      }),
                    )
                  }
                >
                  {t("Cancel before start", "ยกเลิกก่อนเริ่ม")}
                </button>
              )}
            <span className="toolbar-spacer" />
            {job.state === "awaiting_approval" &&
              ["owner", "reviewer"].includes(state.user.role) &&
              job.requestedBy !== state.user.id && (
                <button
                  className="button primary"
                  onClick={() =>
                    run(() =>
                      api(`/jobs/${job.id}/action`, "POST", {
                        action: "approve",
                      }),
                    )
                  }
                >
                  {t("Approve this operation", "อนุมัติคำสั่งนี้")}
                </button>
              )}
            <button className="button" onClick={() => setFocused(null)}>
              {t("Close", "ปิด")}
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
export function SettingsPage() {
  const { state, t, lang, run, refresh } = useFleet();
  const [training, setTraining] = useState(false),
    [count, setCount] = useState(6),
    [users, setUsers] = useState<(User & { disabled: boolean })[]>([]),
    [addUser, setAddUser] = useState(false);
  const owner = state.user.role === "owner",
    c = state.connection,
    workerAlive =
      !!c.workerLastSeenAt &&
      Date.now() - Date.parse(c.workerLastSeenAt) < 15000;
  useEffect(() => {
    if (owner) void api<typeof users>("/users").then(setUsers);
  }, [owner, state.audit.length]);
  return (
    <div className="settings-page">
      <header className="page-heading">
        <div>
          <div className="eyebrow">
            {t("A WORKSPACE YOU CAN TRUST", "พื้นที่ทำงานที่ตรวจสอบได้")}
          </div>
          <h1>{t("Settings", "ตั้งค่า")}</h1>
          <p>
            {t(
              "Connections, access and operational guardrails.",
              "การเชื่อมต่อ สิทธิ์ และขอบเขตการสั่งงาน",
            )}
          </p>
        </div>
      </header>
      <div className="settings-columns">
        <div>
          <section className="settings-card">
            <div className="section-title">
              <Plug size={19} />
              <h2>{t("Xiaohui connection", "การเชื่อมต่อ Xiaohui")}</h2>
              <Badge
                tone={
                  c.mode === "training"
                    ? "amber"
                    : c.mode === "xiaohui"
                      ? "green"
                      : "neutral"
                }
              >
                {c.mode === "training"
                  ? t("Training", "จำลอง")
                  : c.mode === "xiaohui"
                    ? t("Connected", "เชื่อมต่อแล้ว")
                    : t("Not connected", "ยังไม่เชื่อมต่อ")}
              </Badge>
            </div>
            <p>
              {c.mode === "training"
                ? t(
                    "This workspace uses a persistent simulated provider. It cannot control real screens. Use a separate clean data directory when connecting a live test fleet.",
                    "พื้นที่นี้ใช้ผู้ให้บริการจำลองที่บันทึกข้อมูลถาวร ไม่ควบคุมจอจริง ใช้โฟลเดอร์ข้อมูลใหม่เมื่อเชื่อมต่อจอทดสอบจริง",
                  )
                : t(
                    "Build and save content now. When the test fleet is ready, sign in through the dedicated local connector and verify each workflow.",
                    "สร้างและบันทึกเนื้อหาได้เลย เมื่อจอทดสอบพร้อม ให้เข้าสู่ระบบผ่านตัวเชื่อมต่อในเครื่องและตรวจสอบแต่ละขั้นตอน",
                  )}
            </p>
            <dl className="settings-list">
              <div>
                <dt>{t("Verified account", "บัญชีที่ตรวจสอบแล้ว")}</dt>
                <dd>{c.verifiedAccount ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("Worker heartbeat", "การตอบกลับตัวทำงาน")}</dt>
                <dd>
                  <Badge tone={workerAlive ? "green" : "amber"}>
                    {workerAlive
                      ? t("Active", "ทำงาน")
                      : t("Not seen recently", "ไม่พบการตอบกลับล่าสุด")}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt>{t("Last sync", "ซิงค์ล่าสุด")}</dt>
                <dd>{formatDate(c.lastSyncAt, lang)}</dd>
              </div>
              <div>
                <dt>{t("Commissioned actions", "คำสั่งที่ผ่านการตรวจสอบ")}</dt>
                <dd>{c.capabilities.length}</dd>
              </div>
            </dl>
            {c.lastError && <p className="notice warning">{c.lastError}</p>}
            <div className="notice">
              {t(
                "Only verified controls are available. Activity records cloud read-back; physical playback and audio must be checked on the screen.",
                "ใช้ได้เฉพาะคำสั่งที่ตรวจสอบแล้ว ประวัติแสดงผลอ่านกลับจากคลาวด์ ต้องตรวจภาพและเสียงที่จอจริง",
              )}
            </div>
            {owner && (
              <div className="inline">
                <button
                  className={`button ${c.paused ? "primary" : ""}`}
                  onClick={() =>
                    run(() =>
                      api("/connection", "PATCH", { paused: !c.paused }),
                    )
                  }
                >
                  {c.paused ? <Play size={15} /> : <Pause size={15} />}{" "}
                  {c.paused
                    ? t("Resume connector", "ให้ตัวเชื่อมต่อทำงานต่อ")
                    : t("Pause connector", "หยุดตัวเชื่อมต่อ")}
                </button>
                <a
                  className="button"
                  href="https://www.led-cloud.com/#/Rich/DeviceManage"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("Open Xiaohui", "เปิด Xiaohui")}
                  <ExternalLink size={14} />
                </a>
              </div>
            )}
          </section>
          <section className="settings-card">
            <div className="section-title">
              <ShieldCheck size={19} />
              <h2>{t("Operation safeguards", "ความปลอดภัยในการสั่งงาน")}</h2>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(
                  () =>
                    api("/connection", "PATCH", {
                      maxTargets: Number(f.get("maxTargets")),
                      requirePublishApproval: f.get("approval") === "on",
                    }),
                  t("Safeguards saved.", "บันทึกข้อกำหนดแล้ว"),
                );
              }}
            >
              <Field
                label={t(
                  "Maximum screens per operation",
                  "จำนวนจอสูงสุดต่อคำสั่ง",
                )}
              >
                <input
                  key={c.maxTargets}
                  name="maxTargets"
                  type="number"
                  min="1"
                  max="500"
                  defaultValue={c.maxTargets}
                  disabled={!owner}
                />
              </Field>
              <label className="check-line">
                <input
                  key={String(c.requirePublishApproval)}
                  type="checkbox"
                  name="approval"
                  defaultChecked={c.requirePublishApproval}
                  disabled={!owner}
                />
                {t(
                  "Require a different reviewer to approve publish/remove jobs",
                  "ต้องให้ผู้ตรวจอีกคนอนุมัติคำสั่งเผยแพร่หรือนำออก",
                )}
              </label>
              <p className="micro">
                {t(
                  "The connector automatically pauses after three unsuccessful jobs. Unknown results are never automatically replayed.",
                  "ตัวเชื่อมต่อหยุดเองหลังไม่สำเร็จสามงานติด งานที่ไม่ทราบผลจะไม่ถูกสั่งซ้ำอัตโนมัติ",
                )}
              </p>
              {owner && (
                <button className="button" type="submit">
                  {t("Save safeguards", "บันทึกข้อกำหนด")}
                </button>
              )}
            </form>
            {owner && state.devices.length > 0 && (
              <details className="allowed-details">
                <summary>
                  {t("Permitted target screens", "จอที่อนุญาตให้สั่งงาน")} ·{" "}
                  {c.allowedDeviceIds.length}
                </summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(
                      () =>
                        api("/connection", "PATCH", {
                          allowedDeviceIds: f.getAll("device"),
                        }),
                      t("Permitted targets saved.", "บันทึกจอที่อนุญาตแล้ว"),
                    );
                  }}
                >
                  <div className="target-picker">
                    {state.devices.map((d) => (
                      <label
                        key={`${d.id}-${c.allowedDeviceIds.includes(d.id)}`}
                      >
                        <input
                          type="checkbox"
                          name="device"
                          value={d.id}
                          defaultChecked={c.allowedDeviceIds.includes(d.id)}
                        />
                        <span>
                          {d.name}
                          <small>{d.externalId}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                  <button className="button">
                    {t("Save permitted targets", "บันทึกจอที่อนุญาต")}
                  </button>
                </form>
              </details>
            )}
          </section>
          {owner && (
            <section className="settings-card">
              <div className="section-title">
                <Users size={19} />
                <h2>{t("People & roles", "ผู้ใช้และสิทธิ์")}</h2>
                <button
                  className="button small-button"
                  onClick={() => setAddUser(true)}
                >
                  <Plus size={14} />
                  {t("Add person", "เพิ่มผู้ใช้")}
                </button>
              </div>
              <div className="people-list">
                {users.map((u) => (
                  <div key={u.id}>
                    <span className="avatar">{u.name.slice(0, 1)}</span>
                    <span>
                      <strong>{u.name}</strong>
                      <small>{u.email}</small>
                    </span>
                    <Badge tone={u.disabled ? "red" : "neutral"}>
                      {u.disabled ? t("Disabled", "ปิดใช้งาน") : u.role}
                    </Badge>
                    {u.id !== state.user.id && (
                      <button
                        className="text-button"
                        onClick={() =>
                          run(() =>
                            api(`/users/${u.id}`, "PATCH", {
                              disabled: !u.disabled,
                            }),
                          )
                        }
                      >
                        {u.disabled
                          ? t("Enable", "เปิดใช้งาน")
                          : t("Disable", "ปิดใช้งาน")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="micro">
                {t(
                  "Owner: workspace control. Editor: drafts/media. Operator: screen commands. Reviewer: approvals. Viewer: read-only. Group restrictions apply to devices; the content library is shared.",
                  "เจ้าของ: จัดการระบบ · ผู้แก้ไข: เนื้อหาและสื่อ · ผู้ควบคุม: สั่งจอ · ผู้ตรวจ: อนุมัติ · ผู้ดู: อ่านอย่างเดียว จำกัดกลุ่มได้เฉพาะจอ คลังเนื้อหาใช้ร่วมกัน",
                )}
              </p>
            </section>
          )}
        </div>
        <div>
          <section className="settings-card accent-card">
            <div className="section-title">
              <FlaskConical size={19} />
              <h2>{t("Try the complete local flow", "ทดลองขั้นตอนในระบบ")}</h2>
            </div>
            <p>
              {t(
                "Use a training fleet to exercise grouping, uploads, editing, publishing, clearing and power schedules without touching a real display.",
                "ใช้จอจำลองเพื่อทดลองจัดกลุ่ม อัปโหลด แก้ไข เผยแพร่ ล้างโปรแกรม และตั้งเวลา โดยไม่แตะจอจริง",
              )}
            </p>
            {owner && c.mode === "disconnected" && !state.devices.length ? (
              <>
                <Field label={t("Training fleet size", "จำนวนจอจำลอง")}>
                  <select
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                  >
                    <option value={6}>6 {t("screens", "จอ")}</option>
                    <option value={50}>50 {t("screens", "จอ")}</option>
                    <option value={500}>500 {t("screens", "จอ")}</option>
                  </select>
                </Field>
                <button
                  className="button primary full"
                  onClick={() => setTraining(true)}
                >
                  {t("Start training workspace", "เริ่มพื้นที่ฝึกใช้งาน")}
                </button>
              </>
            ) : (
              <Badge tone="amber">
                {c.mode === "training"
                  ? t("Training workspace active", "พื้นที่ฝึกใช้งานพร้อมแล้ว")
                  : t(
                      "Use an empty workspace for training",
                      "ใช้พื้นที่ว่างสำหรับการฝึก",
                    )}
              </Badge>
            )}
          </section>
          <section className="settings-card">
            <div className="section-title">
              <FileText size={19} />
              <h2>{t("Connection checklist", "ขั้นตอนการเชื่อมต่อ")}</h2>
            </div>
            <ol className="steps">
              <li>
                {t("Finish local workflow tests.", "ทดสอบขั้นตอนในระบบให้ครบ")}
              </li>
              <li>
                {t(
                  "Use a clean workspace for the real test account.",
                  "ใช้พื้นที่ใหม่สำหรับบัญชีทดสอบจริง",
                )}
              </li>
              <li>
                {t(
                  "Record stable controls and read-back fields from Xiaohui.",
                  "บันทึกตัวควบคุมและช่องอ่านผลจาก Xiaohui",
                )}
              </li>
              <li>
                {t(
                  "Sign in yourself in the dedicated connector browser.",
                  "เข้าสู่ระบบด้วยตัวเองในเบราว์เซอร์ตัวเชื่อมต่อ",
                )}
              </li>
              <li>
                {t(
                  "Import verified device IDs and allow only the test screens.",
                  "นำเข้ารหัสจอที่ตรวจสอบแล้วและอนุญาตเฉพาะจอทดสอบ",
                )}
              </li>
              <li>
                {t(
                  "Test one function on one screen, verify the result, then expand.",
                  "ทดสอบทีละฟังก์ชันบนจอเดียว ตรวจสอบผลแล้วจึงขยาย",
                )}
              </li>
            </ol>
          </section>
          <section className="settings-card">
            <div className="section-title">
              <Download size={19} />
              <h2>{t("Data & backup", "ข้อมูลและสำรองข้อมูล")}</h2>
            </div>
            <p>
              {t(
                "Data persists on this computer. Export the workspace for inspection; use the backup procedure for the database, media and encrypted secrets.",
                "ข้อมูลบันทึกถาวรในเครื่อง ส่งออกเพื่อดูข้อมูลได้ ใช้ขั้นตอนสำรองสำหรับฐานข้อมูล สื่อ และข้อมูลลับที่เข้ารหัส",
              )}
            </p>
            {owner && (
              <a href="/api/export" className="button full">
                <Download size={15} />
                {t("Export workspace data", "ส่งออกข้อมูลพื้นที่ทำงาน")}
              </a>
            )}
            <p className="micro">
              {t(
                "The JSON export excludes file bytes, passwords and login sessions. It is not a complete backup.",
                "ไฟล์ JSON ไม่รวมไฟล์สื่อ รหัสผ่าน และเซสชัน ไม่ใช่ข้อมูลสำรองครบชุด",
              )}
            </p>
          </section>
        </div>
      </div>
      {training && (
        <Confirm
          title={t("Start a training workspace?", "เริ่มพื้นที่ฝึกใช้งาน?")}
          description={t(
            `This creates ${count} simulated screens. It does not connect to Xiaohui. Keep real test-fleet data in a separate workspace.`,
            `สร้างจอจำลอง ${count} จอ โดยไม่เชื่อมต่อ Xiaohui เก็บข้อมูลจอทดสอบจริงในพื้นที่ทำงานแยกต่างหาก`,
          )}
          label={t("Create training fleet", "สร้างจอจำลอง")}
          onClose={() => setTraining(false)}
          onConfirm={async () => {
            await api("/training", "POST", { count, confirm: "TRAINING" });
            await refresh();
            setTraining(false);
          }}
        />
      )}
      {addUser && (
        <Modal
          title={t("Add a person", "เพิ่มผู้ใช้")}
          onClose={() => setAddUser(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await api("/users", "POST", {
                  name: f.get("name"),
                  email: f.get("email"),
                  password: f.get("password"),
                  role: f.get("role"),
                  groupIds: f.getAll("groups"),
                });
                setAddUser(false);
              });
            }}
          >
            <div className="modal-body">
              <Field label={t("Name", "ชื่อ")}>
                <input name="name" required maxLength={120} />
              </Field>
              <Field label={t("Email", "อีเมล")}>
                <input type="email" name="email" required />
              </Field>
              <Field
                label={t(
                  "Password (12+ characters)",
                  "รหัสผ่าน (12 ตัวอักษรขึ้นไป)",
                )}
              >
                <input
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={200}
                  required
                />
              </Field>
              <Field label={t("Role", "สิทธิ์")}>
                <select name="role" defaultValue="viewer">
                  {["viewer", "editor", "operator", "reviewer", "owner"].map(
                    (role) => (
                      <option key={role}>{role}</option>
                    ),
                  )}
                </select>
              </Field>
              <Field
                label={t(
                  "Allowed device groups (none = all groups)",
                  "กลุ่มจอที่อนุญาต (ไม่เลือก = ทุกกลุ่ม)",
                )}
              >
                <select name="groups" multiple>
                  {state.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <footer>
              <button
                type="button"
                className="button"
                onClick={() => setAddUser(false)}
              >
                {t("Cancel", "ยกเลิก")}
              </button>
              <button className="button primary">
                {t("Create account", "สร้างบัญชี")}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </div>
  );
}
