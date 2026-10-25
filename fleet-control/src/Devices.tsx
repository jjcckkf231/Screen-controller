import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  Folder,
  FolderPlus,
  Monitor,
  RefreshCw,
  CalendarClock,
  SlidersHorizontal,
  ChevronRight,
  MoreHorizontal,
  Sun,
  Volume2,
  RotateCw,
  Power,
  MoveRight,
  Pencil,
  ExternalLink,
  Check,
  Info,
} from "lucide-react";
import {
  groupDescendants,
  nextPowerEvents,
  type Device,
  type Group,
  type Job,
  type PowerSchedule,
} from "../shared/domain";
import { api, canOperate, Field, formatDate, useFleet } from "./context";
import {
  Badge,
  Confirm,
  Empty,
  Modal,
  PowerEditor,
  ProgramThumb,
} from "./components";

export function Devices() {
  const { state, t, lang, run, refresh, notify, navigate } = useFleet();
  const [group, setGroup] = useState<string>("all"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]),
    [focused, setFocused] = useState<string | null>(null);
  const [modal, setModal] = useState<string | null>(null),
    [hover, setHover] = useState<{ d: Device; x: number; y: number } | null>(
      null,
    );
  const [control, setControl] = useState("brightness"),
    [controlValue, setControlValue] = useState("70");
  const selectedDevices = state.devices.filter((d) => selected.includes(d.id));
  const canControl = canOperate(state),
    owner = state.user.role === "owner";
  const visible = useMemo(
    () =>
      state.devices.filter(
        (d) =>
          (group === "all" ||
            (group === "ungrouped"
              ? !d.groupId
              : groupDescendants(state.groups, group).includes(
                  d.groupId ?? "",
                ))) &&
          (filter === "all" ||
            (filter === "online" ? d.online === true : d.online === false)) &&
          `${d.name} ${d.externalId}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [state.devices, state.groups, group, filter, search],
  );
  const inspected = state.devices.find((d) => d.id === focused);
  const selectedGroup = state.groups.find((g) => g.id === group);
  const queue = async (
    command: Job["command"],
    payload: Record<string, unknown> = {},
    ids = selected,
  ) => {
    await api("/jobs", "POST", {
      command,
      payload,
      targetIds: ids,
      idempotencyKey: crypto.randomUUID(),
    });
    await refresh();
    notify(
      t(
        "Operation queued. Track the verified result in Activity.",
        "เข้าคิวแล้ว ตรวจสอบผลยืนยันได้ที่กิจกรรม",
      ),
    );
    setModal(null);
  };
  const toggle = (id: string) =>
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  const commonSchedule =
    selectedDevices.length &&
    selectedDevices.every(
      (d) =>
        JSON.stringify(d.settings.powerSchedule) ===
        JSON.stringify(selectedDevices[0].settings.powerSchedule),
    )
      ? selectedDevices[0].settings.powerSchedule
      : null;
  const showHover = (d: Device, element: HTMLElement) => {
    const box = element.getBoundingClientRect();
    setHover({
      d,
      x: Math.max(12, Math.min(box.right + 10, window.innerWidth - 328)),
      y: Math.max(12, Math.min(box.top, window.innerHeight - 370)),
    });
  };
  const renderGroups = (parent: string | null, depth = 0): React.ReactNode =>
    state.groups
      .filter((g) => g.parentId === parent)
      .map((g) => (
        <div key={g.id}>
          <button
            className={`group-item ${group === g.id ? "selected" : ""}`}
            style={{ paddingLeft: 12 + depth * 14 }}
            onClick={() => {
              setGroup(g.id);
              setSelected([]);
            }}
          >
            <Folder size={15} />
            <span>{g.name}</span>
            <small>
              {
                state.devices.filter((d) =>
                  groupDescendants(state.groups, g.id).includes(
                    d.groupId ?? "",
                  ),
                ).length
              }
            </small>
          </button>
          {depth < 12 && renderGroups(g.id, depth + 1)}
        </div>
      ));
  return (
    <div className="fleet-page">
      <aside className="group-sidebar">
        <div className="panel-heading">
          <strong>{t("Groups", "กลุ่ม")}</strong>
          {owner && (
            <button
              className="icon-button"
              aria-label={t("Create group", "สร้างกลุ่ม")}
              onClick={() => setModal("group")}
            >
              <FolderPlus size={16} />
            </button>
          )}
        </div>
        <button
          className={`group-item ${group === "all" ? "selected" : ""}`}
          onClick={() => {
            setGroup("all");
            setSelected([]);
          }}
        >
          <Monitor size={15} />
          <span>{t("All screens", "ทุกหน้าจอ")}</span>
          <small>{state.devices.length}</small>
        </button>
        {renderGroups(null)}
        <button
          className={`group-item ${group === "ungrouped" ? "selected" : ""}`}
          onClick={() => {
            setGroup("ungrouped");
            setSelected([]);
          }}
        >
          <Folder size={15} />
          <span>{t("Ungrouped", "ยังไม่มีกลุ่ม")}</span>
        </button>
        <div className="panel-tip">
          <Info size={15} />
          <p>
            {t(
              "Groups include their subgroups. A batch always shows the exact screens before you apply it.",
              "กลุ่มรวมกลุ่มย่อยด้วย ทุกคำสั่งจะแสดงจอที่เลือกก่อนนำไปใช้",
            )}
          </p>
        </div>
      </aside>
      <section className="fleet-center">
        <header className="page-heading">
          <div>
            <div className="eyebrow">
              {t("YOUR FLEET, AT A GLANCE", "ภาพรวมหน้าจอของคุณ")}
            </div>
            <h1>
              {selectedGroup?.name ??
                (group === "ungrouped"
                  ? t("Ungrouped screens", "จอที่ยังไม่มีกลุ่ม")
                  : t("All screens", "ทุกหน้าจอ"))}
            </h1>
            <p>
              {t(
                "See what’s running. Change only what you need.",
                "ดูสิ่งที่กำลังแสดง แล้วปรับเฉพาะสิ่งที่ต้องการ",
              )}
            </p>
          </div>
          <div className="inline">
            {selectedGroup && owner && (
              <button
                className="icon-button"
                aria-label={t("Rename group", "เปลี่ยนชื่อกลุ่ม")}
                onClick={() => setModal("rename-group")}
              >
                <Pencil size={16} />
              </button>
            )}
            <button
              className="button"
              disabled={state.connection.mode === "disconnected"}
              onClick={() => run(() => queue("sync_fleet", {}, []))}
            >
              <RefreshCw size={15} />
              {t("Sync", "ซิงค์")}
            </button>
            {canControl && (
              <button
                className="button primary"
                onClick={() => setModal("add")}
              >
                <Plus size={16} />
                {t("Add screen", "เพิ่มจอ")}
              </button>
            )}
          </div>
        </header>
        <div className="fleet-summary">
          <span>
            <i className="status-dot green" />
            {state.devices.filter((d) => d.online === true).length}{" "}
            {t("online", "ออนไลน์")}
          </span>
          <span>
            <i className="status-dot gray" />
            {state.devices.filter((d) => d.online === false).length}{" "}
            {t("offline", "ออฟไลน์")}
          </span>
          <span>
            <i className="status-dot amber" />
            {state.devices.filter((d) => d.online === null).length}{" "}
            {t("unknown", "ไม่ทราบ")}
          </span>
          <small>
            {t("Last sync", "ซิงค์ล่าสุด")}{" "}
            {formatDate(state.connection.lastSyncAt, lang)}
          </small>
        </div>
        <div className="content-toolbar">
          <div className="search">
            <Search size={16} />
            <input
              placeholder={t("Search name or device ID", "ค้นหาชื่อหรือรหัสจอ")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t("Search screens", "ค้นหาจอ")}
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label={t("Connection status", "สถานะการเชื่อมต่อ")}
          >
            <option value="all">{t("All statuses", "ทุกสถานะ")}</option>
            <option value="online">{t("Online", "ออนไลน์")}</option>
            <option value="offline">{t("Offline", "ออฟไลน์")}</option>
          </select>
          <span className="toolbar-spacer" />
          <label className="check-line">
            <input
              type="checkbox"
              checked={
                visible.length > 0 &&
                visible.every((d) => selected.includes(d.id))
              }
              onChange={(e) =>
                setSelected(e.target.checked ? visible.map((d) => d.id) : [])
              }
            />
            {t("Select visible", "เลือกที่แสดง")}
          </label>
        </div>
        {selected.length > 0 && (
          <div className="selection-bar">
            <strong>
              {selected.length} {t("selected", "จอที่เลือก")}
            </strong>
            {canControl && (
              <>
                <button onClick={() => setModal("move")}>
                  <MoveRight size={15} />
                  {t("Move", "ย้ายกลุ่ม")}
                </button>
                <button onClick={() => setModal("power")}>
                  <CalendarClock size={15} />
                  {t("Power schedule", "เวลาเปิด–ปิด")}
                </button>
                <button onClick={() => setModal("controls")}>
                  <SlidersHorizontal size={15} />
                  {t("Controls", "ควบคุม")}
                </button>
              </>
            )}
            <button onClick={() => setSelected([])}>
              {t("Deselect", "ยกเลิกเลือก")}
            </button>
          </div>
        )}
        {!visible.length ? (
          <Empty
            title={
              state.devices.length
                ? t("No matching screens", "ไม่พบหน้าจอ")
                : t("Your screens will live here", "หน้าจอของคุณจะแสดงที่นี่")
            }
            text={
              state.devices.length
                ? t(
                    "Try another search or group.",
                    "ลองค้นหาใหม่หรือเปลี่ยนกลุ่ม",
                  )
                : t(
                    "Create content first, then connect your test fleet. You can also try every local workflow in a clearly labelled training workspace.",
                    "สร้างเนื้อหาก่อน แล้วเชื่อมต่อจอทดสอบ หรือทดลองขั้นตอนต่าง ๆ ในพื้นที่ฝึกใช้งานที่ระบุชัดเจน",
                  )
            }
            action={
              <button
                className="button primary"
                onClick={() => navigate("settings")}
              >
                {t("Open connection setup", "ตั้งค่าการเชื่อมต่อ")}
                <ChevronRight size={16} />
              </button>
            }
          />
        ) : (
          <div className="screen-grid">
            {visible.map((d) => (
              <article
                key={d.id}
                className={`screen-card ${focused === d.id ? "focused" : ""} ${selected.includes(d.id) ? "checked" : ""}`}
              >
                <div className="card-top">
                  <input
                    type="checkbox"
                    checked={selected.includes(d.id)}
                    onChange={() => toggle(d.id)}
                    aria-label={`${t("Select", "เลือก")} ${d.name}`}
                  />
                  <Badge
                    tone={
                      d.online === true
                        ? "green"
                        : d.online === false
                          ? "neutral"
                          : "amber"
                    }
                  >
                    {d.online === true
                      ? t("Online", "ออนไลน์")
                      : d.online === false
                        ? t("Offline", "ออฟไลน์")
                        : t("Unknown", "ไม่ทราบ")}
                  </Badge>
                  <span className="toolbar-spacer" />
                  <small>
                    {d.settings.width} × {d.settings.height}
                  </small>
                </div>
                <button
                  className="screen-main"
                  onClick={() => {
                    setFocused(d.id);
                    setHover(null);
                  }}
                  onMouseEnter={(e) => showHover(d, e.currentTarget)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={(e) => showHover(d, e.currentTarget)}
                  onBlur={() => setHover(null)}
                  aria-label={`${d.name}, ${t("show settings", "แสดงการตั้งค่า")}`}
                >
                  <ProgramThumb
                    program={state.publishedPrograms.find(
                      (p) =>
                        p.id === d.settings.programId &&
                        p.version === d.settings.programVersion,
                    )}
                    media={state.media}
                  />
                  <div className="screen-card-title">
                    <strong>{d.name}</strong>
                    <small>{d.externalId}</small>
                  </div>
                </button>
                <div className="card-footer">
                  <CalendarClock size={14} />
                  <span>
                    {d.settings.powerSchedule === null
                      ? t("Power schedule not read yet", "ยังไม่ได้อ่านตารางเปิด–ปิด")
                      : d.settings.powerSchedule?.enabled
                      ? d.settings.powerSchedule.rules
                          .map((r) => `${r.on}–${r.off}`)
                          .join(" · ")
                      : t(
                          "No automatic power schedule",
                          "ไม่มีตารางเปิด–ปิดอัตโนมัติ",
                        )}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="list-footnote">
          {t(
            "Hover or focus a screen to see saved settings. Click it for full details. Settings show the last observation, not a live video feed.",
            "วางเมาส์หรือโฟกัสที่จอเพื่อดูค่าล่าสุด คลิกเพื่อดูรายละเอียด ข้อมูลนี้ไม่ใช่ภาพสดจากจอ",
          )}
        </div>
      </section>
      {inspected && (
        <aside className="device-inspector">
          <div className="panel-heading">
            <strong>{t("Screen details", "รายละเอียดจอ")}</strong>
            <button
              className="icon-button"
              onClick={() => setFocused(null)}
              aria-label={t("Close details", "ปิดรายละเอียด")}
            >
              ×
            </button>
          </div>
          <div className="inspector-body">
            <ProgramThumb
              program={state.publishedPrograms.find(
                (p) =>
                  p.id === inspected.settings.programId &&
                  p.version === inspected.settings.programVersion,
              )}
              media={state.media}
            />
            <h2>{inspected.name}</h2>
            <small className="mono">{inspected.externalId}</small>
            <SettingsDetails device={inspected} />
            <button
              className="button full"
              onClick={() =>
                run(() => queue("refresh_device", {}, [inspected.id]))
              }
            >
              <RefreshCw size={14} />
              {t("Refresh from provider", "โหลดค่าจากผู้ให้บริการ")}
            </button>
            {canControl && (
              <>
                <button
                  className="button full"
                  onClick={() => {
                    setSelected([inspected.id]);
                    setModal("power");
                  }}
                >
                  <CalendarClock size={15} />
                  {t("Edit power schedule", "แก้ไขตารางเปิด–ปิด")}
                </button>
                <button
                  className="button full"
                  onClick={() => {
                    setSelected([inspected.id]);
                    setModal("rename-device");
                  }}
                >
                  <Pencil size={15} />
                  {t("Rename screen", "เปลี่ยนชื่อจอ")}
                </button>
              </>
            )}
            <p className="micro">
              {t(
                "Reported settings only change after a verified read-back. An accepted cloud command is not proof of physical playback.",
                "ค่าที่รายงานจะเปลี่ยนหลังตรวจสอบผล ไม่ถือว่าคำสั่งที่คลาวด์รับแล้วเป็นการยืนยันภาพบนจอจริง",
              )}
            </p>
          </div>
        </aside>
      )}
      {hover && (
        <div
          className="screen-hover"
          style={{ left: hover.x, top: hover.y }}
          role="tooltip"
        >
          <div className="inline">
            <Monitor size={18} />
            <strong>{hover.d.name}</strong>
          </div>
          <SettingsDetails device={hover.d} compact />
        </div>
      )}
      {modal === "power" && (
        <PowerEditor
          initial={commonSchedule || undefined}
          targets={selected.length}
          targetNames={selectedDevices}
          mixed={selected.length > 1 && !commonSchedule}
          onClose={() => setModal(null)}
          onSave={async (schedule) => queue("set_power_schedule", { schedule })}
        />
      )}
      {["group", "rename-group", "move", "rename-device"].includes(
        modal ?? "",
      ) && (
        <Modal
          title={
            modal === "group"
              ? t("Create a group", "สร้างกลุ่ม")
              : modal === "rename-group"
                ? t("Rename group", "เปลี่ยนชื่อกลุ่ม")
                : modal === "move"
                  ? t("Move selected screens", "ย้ายจอที่เลือก")
                  : t("Rename screen", "เปลี่ยนชื่อจอ")
          }
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void run(async () => {
                if (modal === "group")
                  await queue(
                    "create_group",
                    {
                      name: form.get("name"),
                      parentId: form.get("group") || null,
                    },
                    [],
                  );
                else if (modal === "rename-group")
                  await queue(
                    "rename_group",
                    {
                      id: group,
                      name: form.get("name"),
                      version: selectedGroup!.version,
                    },
                    [],
                  );
                else if (modal === "rename-device")
                  await queue("rename_device", { name: form.get("name") });
                else
                  await queue("move_devices", {
                    groupId: form.get("group") || null,
                  });
              });
            }}
          >
            <div className="modal-body">
              {modal !== "move" && (
                <Field label={t("Name", "ชื่อ")}>
                  <input
                    name="name"
                    defaultValue={
                      modal === "rename-group"
                        ? selectedGroup?.name
                        : modal === "rename-device"
                          ? selectedDevices[0]?.name
                          : ""
                    }
                    required
                    maxLength={120}
                    autoFocus
                  />
                </Field>
              )}
              {(modal === "group" || modal === "move") && (
                <Field
                  label={
                    modal === "group"
                      ? t("Parent group", "กลุ่มหลัก")
                      : t("Destination group", "กลุ่มปลายทาง")
                  }
                >
                  <select name="group" defaultValue={selectedGroup?.id ?? ""}>
                    <option value="">
                      {t("Top level / ungrouped", "ระดับบนสุด / ไม่จัดกลุ่ม")}
                    </option>
                    {state.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {modal === "move" && <TargetList devices={selectedDevices} />}
            </div>
            <footer>
              <button
                type="button"
                className="button"
                onClick={() => setModal(null)}
              >
                {t("Cancel", "ยกเลิก")}
              </button>
              <button className="button primary">
                {t("Apply", "นำไปใช้")}
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {modal === "controls" && (
        <Modal
          title={t("Screen controls", "ควบคุมจอ")}
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                queue("device_control", {
                  action: control,
                  value: ["power"].includes(control)
                    ? controlValue
                    : Number(controlValue),
                  confirm: control === "restart" ? "RESTART" : undefined,
                }),
              );
            }}
          >
            <div className="modal-body">
              <TargetList devices={selectedDevices} />
              <Field label={t("Setting", "การตั้งค่า")}>
                <select
                  value={control}
                  onChange={(e) => {
                    setControl(e.target.value);
                    setControlValue(
                      e.target.value === "power"
                        ? "on"
                        : e.target.value === "rotation"
                          ? "0"
                          : "70",
                    );
                  }}
                >
                  {[
                    "brightness",
                    "volume",
                    "rotation",
                    "power",
                    "restart",
                    "screenshot",
                  ].map((c) => (
                    <option key={c} value={c}>
                      {
                        (
                          {
                            brightness: t("Brightness", "ความสว่าง"),
                            volume: t("Volume", "เสียง"),
                            rotation: t("Rotation", "การหมุน"),
                            power: t("Power now", "เปิด–ปิดทันที"),
                            restart: t("Restart player", "รีสตาร์ทเครื่องเล่น"),
                            screenshot: t("Request screenshot", "ขอภาพหน้าจอ"),
                          } as Record<string, string>
                        )[c]
                      }
                    </option>
                  ))}
                </select>
              </Field>
              {["brightness", "volume"].includes(control) ? (
                <Field label={`${t("Value", "ค่า")} · ${controlValue}%`}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={controlValue}
                    onChange={(e) => setControlValue(e.target.value)}
                  />
                </Field>
              ) : control === "rotation" ? (
                <Field label={t("Angle", "มุม")}>
                  <select
                    value={controlValue}
                    onChange={(e) => setControlValue(e.target.value)}
                  >
                    {[0, 90, 180, 270].map((n) => (
                      <option key={n} value={n}>
                        {n}°
                      </option>
                    ))}
                  </select>
                </Field>
              ) : control === "power" ? (
                <Field label={t("Power", "เปิด–ปิด")}>
                  <select
                    value={controlValue}
                    onChange={(e) => setControlValue(e.target.value)}
                  >
                    <option value="on">{t("Turn on", "เปิด")}</option>
                    <option value="off">{t("Turn off", "ปิด")}</option>
                  </select>
                </Field>
              ) : (
                <p className="notice">
                  {control === "restart"
                    ? t(
                        "Restarting interrupts playback. Applying confirms the restart of every selected screen.",
                        "รีสตาร์ทจะหยุดการเล่นชั่วคราว การนำไปใช้เป็นการยืนยันรีสตาร์ททุกจอที่เลือก",
                      )
                    : t(
                        "Only supported real players can return a screenshot. Training players cannot.",
                        "เฉพาะจอจริงที่รองรับจึงส่งภาพหน้าจอได้ จอจำลองไม่สามารถส่งภาพจริง",
                      )}
                </p>
              )}
            </div>
            <footer>
              <button
                type="button"
                className="button"
                onClick={() => setModal(null)}
              >
                {t("Cancel", "ยกเลิก")}
              </button>
              <button
                className={`button ${control === "restart" || (control === "power" && controlValue === "off") ? "danger" : "primary"}`}
              >
                {t("Confirm and apply", "ยืนยันและนำไปใช้")}
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {modal === "add" && (
        <Modal
          title={t("Add a screen", "เพิ่มหน้าจอ")}
          onClose={() => setModal(null)}
        >
          {state.connection.mode === "training" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void run(
                  async () => {
                    await api("/training/devices", "POST", {
                      name: data.get("name"),
                      groupId: data.get("group") || null,
                      width: Number(data.get("width")),
                      height: Number(data.get("height")),
                    });
                    setModal(null);
                  },
                  t("Training player added.", "เพิ่มจอจำลองแล้ว"),
                );
              }}
            >
              <div className="modal-body">
                <Badge tone="amber">
                  {t("Simulated player only", "จอจำลองเท่านั้น")}
                </Badge>
                <Field label={t("Screen name", "ชื่อจอ")}>
                  <input name="name" required maxLength={120} />
                </Field>
                <div className="two-columns">
                  <Field label={t("Width", "ความกว้าง")}>
                    <input
                      name="width"
                      type="number"
                      defaultValue="1080"
                      min="64"
                      max="16384"
                    />
                  </Field>
                  <Field label={t("Height", "ความสูง")}>
                    <input
                      name="height"
                      type="number"
                      defaultValue="1920"
                      min="64"
                      max="16384"
                    />
                  </Field>
                </div>
                <Field label={t("Group", "กลุ่ม")}>
                  <select name="group" defaultValue={selectedGroup?.id ?? ""}>
                    <option value="">{t("Ungrouped", "ไม่จัดกลุ่ม")}</option>
                    {state.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <footer>
                <button className="button primary">
                  {t("Add training player", "เพิ่มจอจำลอง")}
                </button>
              </footer>
            </form>
          ) : (
            <div className="modal-body">
              <p>
                {t(
                  "Xiaohui players enroll through their own player settings—not a made-up pairing code.",
                  "เพิ่มเครื่องเล่นผ่านการตั้งค่าของ Xiaohui ไม่ใช้รหัสจับคู่ที่สร้างขึ้นเอง",
                )}
              </p>
              <ol className="steps">
                <li>
                  {t(
                    "Connect the player to Wi-Fi or Ethernet.",
                    "เชื่อมต่อเครื่องเล่นกับ Wi-Fi หรือสาย LAN",
                  )}
                </li>
                <li>
                  {t(
                    "Open the MagicPlayer settings on the screen.",
                    "เปิดการตั้งค่า MagicPlayer บนจอ",
                  )}
                </li>
                <li>
                  {t(
                    "Verify the cloud server region and account with the test-fleet owner.",
                    "ตรวจสอบภูมิภาคเซิร์ฟเวอร์และบัญชีกับเจ้าของจอทดสอบ",
                  )}
                </li>
                <li>
                  {t(
                    "Confirm the player appears in Xiaohui, then commission the connector and sync it here.",
                    "ยืนยันว่าจอแสดงใน Xiaohui แล้วตั้งค่าตัวเชื่อมต่อและซิงค์มาที่นี่",
                  )}
                </li>
              </ol>
              <div className="notice">
                {t(
                  "Live enrollment and exact player menus must be verified during the test-fleet connection step. No real screen will be added by this dialog.",
                  "ต้องตรวจสอบเมนูและการลงทะเบียนจริงในขั้นตอนเชื่อมต่อจอทดสอบ หน้าต่างนี้ยังไม่เพิ่มจอจริง",
                )}
              </div>
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
        </Modal>
      )}
    </div>
  );
}
export function TargetList({ devices }: { devices: Device[] }) {
  const { t } = useFleet();
  return (
    <div className="target-list">
      <strong>
        {t("Exact target screens", "หน้าจอที่จะได้รับคำสั่ง")} ·{" "}
        {devices.length}
      </strong>
      <div>
        {devices.map((d) => (
          <span key={d.id}>
            <Monitor size={13} />
            {d.name}
            <small>{d.externalId}</small>
          </span>
        ))}
      </div>
    </div>
  );
}
function SettingsDetails({
  device,
  compact = false,
}: {
  device: Device;
  compact?: boolean;
}) {
  const { t, lang, state } = useFleet();
  const s = device.settings,
    events = nextPowerEvents(s.powerSchedule);
  return (
    <>
      <dl className="settings-list">
        <div>
          <dt>{t("Group", "กลุ่ม")}</dt>
          <dd>
            {state.groups.find((g) => g.id === device.groupId)?.name ??
              t("Ungrouped", "ไม่จัดกลุ่ม")}
          </dd>
        </div>
        <div>
          <dt>{t("Program", "โปรแกรม")}</dt>
          <dd>{s.programName ?? t("Unknown / none", "ไม่ทราบ / ไม่มี")}</dd>
        </div>
        <div>
          <dt>
            <Sun size={13} />
            {t("Brightness", "ความสว่าง")}
          </dt>
          <dd>{s.brightness === null ? "—" : `${s.brightness}%`}</dd>
        </div>
        <div>
          <dt>
            <Volume2 size={13} />
            {t("Volume", "เสียง")}
          </dt>
          <dd>{s.volume === null ? "—" : `${s.volume}%`}</dd>
        </div>
        <div>
          <dt>
            <RotateCw size={13} />
            {t("Rotation", "การหมุน")}
          </dt>
          <dd>{s.rotation === null ? "—" : `${s.rotation}°`}</dd>
        </div>
        <div>
          <dt>
            <Power size={13} />
            {t("Power", "พลังงาน")}
          </dt>
          <dd>
            {s.power === "on"
              ? t("On", "เปิด")
              : s.power === "off"
                ? t("Off", "ปิด")
                : t("Unknown", "ไม่ทราบ")}
          </dd>
        </div>
        <div>
          <dt>{t("Timezone", "เขตเวลา")}</dt>
          <dd>{s.powerSchedule?.timezone ?? s.timezone ?? "—"}</dd>
        </div>
        {!compact && (
          <>
            <div>
              <dt>{t("Resolution", "ความละเอียด")}</dt>
              <dd>
                {s.width} × {s.height}
              </dd>
            </div>
            <div>
              <dt>{t("Firmware", "เฟิร์มแวร์")}</dt>
              <dd>{s.firmware ?? "—"}</dd>
            </div>
          </>
        )}
      </dl>
      {device.scheduleStatus === "pending" && (
        <Badge tone="amber">
          {t("Schedule change pending", "รอเปลี่ยนตารางเวลา")}
        </Badge>
      )}
      {events[0] && (
        <div className="next-change">
          <CalendarClock size={14} />
          <span>
            {t("Next power event", "กำหนดเปิด–ปิดครั้งถัดไป")}
            <strong>
              {events[0].state === "on" ? t("On", "เปิด") : t("Off", "ปิด")} ·{" "}
              {new Date(events[0].at).toLocaleString(
                lang === "th" ? "th-TH-u-ca-gregory" : "en-GB",
                {
                  timeZone: s.powerSchedule!.timezone,
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                },
              )}
            </strong>
          </span>
        </div>
      )}
      <p className="micro">
        {t("Observed", "อ่านค่าล่าสุด")} {formatDate(s.observedAt, lang)}
        <br />
        {t("Source", "แหล่งข้อมูล")}: {s.source}{" "}
        {s.observedAt &&
          Date.now() - Date.parse(s.observedAt) > 300000 &&
          `· ${t("may be stale", "อาจไม่ใช่ค่าปัจจุบัน")}`}
      </p>
    </>
  );
}
