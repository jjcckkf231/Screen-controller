import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  Plus,
  Search,
  Layers,
  ArrowLeft,
  Save,
  Upload,
  Play,
  Undo2,
  Redo2,
  Trash2,
  Copy,
  MoreHorizontal,
  Image,
  Film,
  Type,
  Clock,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
  History,
  CalendarClock,
  Send,
  Settings2,
  GripVertical,
  MousePointer2,
  PanelLeft,
  Monitor,
} from "lucide-react";
import {
  blankProgram,
  groupDescendants,
  newLayer,
  widgetTypes,
  type Layer,
  type Program,
  type ScreenLayout,
} from "../shared/domain";
import {
  api,
  canEdit,
  canOperate,
  Field,
  formatDate,
  useFleet,
} from "./context";
import {
  Badge,
  Confirm,
  Empty,
  LayoutPreview,
  Modal,
  ProgramThumb,
} from "./components";
import { MediaPicker } from "./MediaLibrary";
import { TargetList } from "./Devices";

export function Programs() {
  const { state, t, run, refresh } = useFleet();
  const [opened, setOpened] = useState<Program | null>(null),
    [search, setSearch] = useState(""),
    [archived, setArchived] = useState(false),
    [create, setCreate] = useState(false);
  if (opened)
    return <ProgramEditor initial={opened} onClose={() => setOpened(null)} />;
  const programs = state.programs.filter(
    (p) =>
      !!p.deletedAt === archived &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="library-page">
      <header className="page-heading">
        <div>
          <div className="eyebrow">
            {t("DESIGN. PREVIEW. PUBLISH.", "ออกแบบ ตรวจสอบ แล้วเผยแพร่")}
          </div>
          <h1>{t("Programs", "โปรแกรม")}</h1>
          <p>
            {t(
              "Build the content once. Choose the screens when you publish.",
              "สร้างเนื้อหาก่อน แล้วเลือกจอเมื่อต้องการเผยแพร่",
            )}
          </p>
        </div>
        {canEdit(state) && (
          <button className="button primary" onClick={() => setCreate(true)}>
            <Plus size={16} />
            {t("New program", "สร้างโปรแกรม")}
          </button>
        )}
      </header>
      <div className="content-toolbar">
        <div className="search">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search programs", "ค้นหาโปรแกรม")}
            aria-label={t("Search programs", "ค้นหาโปรแกรม")}
          />
        </div>
        <div className="segmented">
          <button
            className={!archived ? "active" : ""}
            onClick={() => setArchived(false)}
          >
            {t("Active", "ใช้งาน")}
          </button>
          <button
            className={archived ? "active" : ""}
            onClick={() => setArchived(true)}
          >
            {t("Archive", "เก็บถาวร")}
          </button>
        </div>
      </div>
      {programs.length ? (
        <div className="program-grid">
          {programs.map((p) => (
            <article className="program-card" key={p.id}>
              <button
                className="program-open"
                onClick={() => !archived && setOpened(p)}
              >
                <ProgramThumb program={p} media={state.media} />
                <div>
                  <strong>{p.name}</strong>
                  <small>
                    {p.screens[0].width} × {p.screens[0].height} ·{" "}
                    {p.screens.length} {t("screen(s)", "หน้าจอ")} · v{p.version}
                  </small>
                </div>
              </button>
              <div className="card-footer">
                <Badge
                  tone={
                    p.status === "approved"
                      ? "green"
                      : p.status === "submitted"
                        ? "amber"
                        : "neutral"
                  }
                >
                  {p.status === "approved"
                    ? t("Approved", "อนุมัติแล้ว")
                    : p.status === "submitted"
                      ? t("In review", "รอตรวจ")
                      : t("Draft", "ฉบับร่าง")}
                </Badge>
                <span className="toolbar-spacer" />
                {archived && canEdit(state) ? (
                  <button
                    className="text-button"
                    onClick={() =>
                      run(() =>
                        api(`/programs/${p.id}/action`, "POST", {
                          action: "restore",
                          version: p.version,
                        }),
                      )
                    }
                  >
                    {t("Restore", "กู้คืน")}
                  </button>
                ) : (
                  <small>
                    {p.lastPublishedVersion
                      ? `${t("Published", "เผยแพร่")} v${p.lastPublishedVersion}`
                      : t("Not published", "ยังไม่เผยแพร่")}
                  </small>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={<Layers size={28} />}
          title={
            archived
              ? t("Archive is empty", "ไม่มีโปรแกรมที่เก็บถาวร")
              : t("Start with a blank canvas", "เริ่มจากพื้นที่ว่าง")
          }
          text={t(
            "Add an image, a video, or a text layer. Your drafts never change a screen until you publish.",
            "เพิ่มรูปภาพ วิดีโอ หรือข้อความ ฉบับร่างจะไม่เปลี่ยนจอจนกว่าจะเผยแพร่",
          )}
          action={
            !archived &&
            canEdit(state) && (
              <button
                className="button primary"
                onClick={() => setCreate(true)}
              >
                <Plus size={16} />
                {t("Create a program", "สร้างโปรแกรม")}
              </button>
            )
          }
        />
      )}
      {create && (
        <Modal
          title={t("New program", "สร้างโปรแกรม")}
          onClose={() => setCreate(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                const input = blankProgram(
                  String(f.get("name")),
                  Number(f.get("width")),
                  Number(f.get("height")),
                );
                input.type = f.get("type") as Program["type"];
                const p = await api<Program>("/programs", "POST", input);
                setCreate(false);
                setOpened(p);
              });
            }}
          >
            <div className="modal-body">
              <Field label={t("Program name", "ชื่อโปรแกรม")}>
                <input
                  name="name"
                  placeholder={t("e.g. Weekend menu", "เช่น เมนูสุดสัปดาห์")}
                  autoFocus
                  required
                  maxLength={120}
                />
              </Field>
              <div className="two-columns">
                <Field label={t("Width (px)", "ความกว้าง (px)")}>
                  <input
                    type="number"
                    name="width"
                    defaultValue="1080"
                    min="64"
                    max="16384"
                    required
                  />
                </Field>
                <Field label={t("Height (px)", "ความสูง (px)")}>
                  <input
                    type="number"
                    name="height"
                    defaultValue="1920"
                    min="64"
                    max="16384"
                    required
                  />
                </Field>
              </div>
              <Field label={t("Program type", "ประเภทโปรแกรม")}>
                <select name="type">
                  <option value="ordinary">
                    {t("Ordinary · one screen", "ทั่วไป · หนึ่งหน้าจอ")}
                  </option>
                  <option value="multi-screen">
                    {t("Multi-screen", "หลายหน้าจอ")}
                  </option>
                  <option value="soft-splicing">
                    {t("Soft splicing", "ภาพต่อเนื่องหลายจอ")}
                  </option>
                  <option value="h5">H5</option>
                  <option value="full-color">
                    {t("Full-color LED", "LED สีเต็ม")}
                  </option>
                  <option value="single-color">
                    {t("Single-color LED", "LED สีเดียว")}
                  </option>
                </select>
              </Field>
              <div className="notice">
                {t(
                  "Advanced program types are preserved in the local model. Exact Xiaohui compatibility must be verified on your test players before publishing.",
                  "รองรับข้อมูลประเภทโปรแกรมขั้นสูงในระบบนี้ ต้องทดสอบความเข้ากันได้กับ Xiaohui และเครื่องเล่นจริงก่อนเผยแพร่",
                )}
              </div>
            </div>
            <footer>
              <button
                type="button"
                className="button"
                onClick={() => setCreate(false)}
              >
                {t("Cancel", "ยกเลิก")}
              </button>
              <button className="button primary">
                {t("Create program", "สร้างโปรแกรม")}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </div>
  );
}

function ProgramEditor({
  initial,
  onClose,
}: {
  initial: Program;
  onClose: () => void;
}) {
  const { state, t, lang, run, refresh, notify } = useFleet();
  const [program, setProgram] = useState<Program>(structuredClone(initial)),
    [saved, setSaved] = useState(JSON.stringify(initial));
  const [screenId, setScreenId] = useState(initial.screens[0].id),
    [layerId, setLayerId] = useState<string | null>(null),
    [modal, setModal] = useState<string | null>(null);
  const [past, setPast] = useState<Program[]>([]),
    [future, setFuture] = useState<Program[]>([]),
    [revisions, setRevisions] = useState<(Program & { programId: string })[]>(
      [],
    );
  const [zoom, setZoom] = useState(100),
    [saving, setSaving] = useState(false),
    [replaceMedia, setReplaceMedia] = useState(false);
  const canvas = useRef<HTMLDivElement>(null),
    drag = useRef<{
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      corner?: "tl" | "tr" | "bl" | "br";
      px: number;
      py: number;
      scale: number;
      initial: Program;
    } | null>(null),
    pendingNavigation = useRef<(() => void) | null>(null);
  const editable = canEdit(state),
    dirty = JSON.stringify(program) !== saved;
  const screen =
      program.screens.find((s) => s.id === screenId) ?? program.screens[0],
    layer = screen.layers.find((l) => l.id === layerId);
  const change = (next: Program, history = true) => {
    if (!editable) return;
    if (history) {
      setPast((p) => [...p.slice(-49), structuredClone(program)]);
      setFuture([]);
    }
    setProgram(next);
  };
  const updateScreen = (patch: Partial<ScreenLayout>) =>
    change({
      ...program,
      screens: program.screens.map((s) =>
        s.id === screen.id ? { ...s, ...patch } : s,
      ),
    });
  const updateLayer = (patch: Partial<Layer>) =>
    updateScreen({
      layers: screen.layers.map((l) =>
        l.id === layerId ? { ...l, ...patch } : l,
      ),
    });
  const undo = () => {
    const p = past.at(-1);
    if (!p) return;
    setFuture((f) => [program, ...f]);
    setPast(past.slice(0, -1));
    setProgram({ ...p, version: program.version });
  };
  const redo = () => {
    const p = future[0];
    if (!p) return;
    setPast((past) => [...past, program]);
    setFuture(future.slice(1));
    setProgram({ ...p, version: program.version });
  };
  const accept = (p: Program) => {
    setProgram(p);
    setSaved(JSON.stringify(p));
    setPast([]);
    setFuture([]);
  };
  const save = async () => {
    setSaving(true);
    try {
      const p = await api<Program>(`/programs/${program.id}`, "PUT", program);
      accept(p);
      await refresh();
      notify(
        t(
          "Draft saved. Playing screens are unchanged.",
          "บันทึกฉบับร่างแล้ว จอที่กำลังเล่นไม่เปลี่ยนแปลง",
        ),
      );
      return p;
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [dirty]);
  useEffect(() => {
    const navigation = (e: Event) => {
      if (!dirty) return;
      e.preventDefault();
      pendingNavigation.current = (
        e as CustomEvent<{ go: () => void }>
      ).detail.go;
      setModal("leave");
    };
    window.addEventListener("fleet-navigation", navigation);
    return () => window.removeEventListener("fleet-navigation", navigation);
  }, [dirty]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (editable && !saving) void run(save);
      }
      if (
        e.key.toLowerCase() === "z" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });
  const addLayer = (type: Layer["type"]) => {
    const next = newLayer(type, screen);
    updateScreen({ layers: [...screen.layers, next] });
    setLayerId(next.id);
    if (["image", "video", "mixed", "document"].includes(type)) {
      setReplaceMedia(false);
      setModal("media");
    }
  };
  const reorder = (id: string, offset: number) => {
    const from = screen.layers.findIndex((l) => l.id === id),
      to = from + offset;
    if (to < 0 || to >= screen.layers.length) return;
    const list = [...screen.layers];
    [list[from], list[to]] = [list[to], list[from]];
    updateScreen({ layers: list });
  };
  const pointerDown = (
    e: PointerEvent<HTMLElement>,
    l: Layer,
    corner?: "tl" | "tr" | "bl" | "br",
  ) => {
    e.stopPropagation();
    setLayerId(l.id);
    if (!editable || l.locked || e.button !== 0) return;
    const rect = canvas.current!.getBoundingClientRect();
    drag.current = {
      id: l.id,
      x: l.x,
      y: l.y,
      width: l.width,
      height: l.height,
      corner,
      px: e.clientX,
      py: e.clientY,
      scale: rect.width / screen.width,
      initial: structuredClone(program),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const pointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const current = screen.layers.find((l) => l.id === d.id)!;
    if (d.corner) {
      const dx = (e.clientX - d.px) / d.scale,
        dy = (e.clientY - d.py) / d.scale;
      const left = d.corner.includes("l")
        ? Math.max(0, Math.min(d.x + d.width - 1, d.x + dx))
        : d.x;
      const right = d.corner.includes("r")
        ? Math.min(screen.width, Math.max(d.x + 1, d.x + d.width + dx))
        : d.x + d.width;
      const top = d.corner.includes("t")
        ? Math.max(0, Math.min(d.y + d.height - 1, d.y + dy))
        : d.y;
      const bottom = d.corner.includes("b")
        ? Math.min(screen.height, Math.max(d.y + 1, d.y + d.height + dy))
        : d.y + d.height;
      setProgram((p) => ({
        ...p,
        screens: p.screens.map((s) =>
          s.id === screen.id
            ? {
                ...s,
                layers: s.layers.map((l) =>
                  l.id === d.id
                    ? {
                        ...l,
                        x: Math.round(left),
                        y: Math.round(top),
                        width: Math.max(1, Math.round(right - left)),
                        height: Math.max(1, Math.round(bottom - top)),
                      }
                    : l,
                ),
              }
            : s,
        ),
      }));
      return;
    }
    const x = Math.round(
        Math.max(
          0,
          Math.min(
            screen.width - current.width,
            d.x + (e.clientX - d.px) / d.scale,
          ),
        ),
      ),
      y = Math.round(
        Math.max(
          0,
          Math.min(
            screen.height - current.height,
            d.y + (e.clientY - d.py) / d.scale,
          ),
        ),
      );
    setProgram((p) => ({
      ...p,
      screens: p.screens.map((s) =>
        s.id === screen.id
          ? {
              ...s,
              layers: s.layers.map((l) => (l.id === d.id ? { ...l, x, y } : l)),
            }
          : s,
      ),
    }));
  };
  const pointerUp = () => {
    if (drag.current) {
      setPast((p) => [...p.slice(-49), drag.current!.initial]);
      setFuture([]);
      drag.current = null;
    }
  };
  const numeric = (
    key:
      | "x"
      | "y"
      | "width"
      | "height"
      | "rotation"
      | "opacity"
      | "duration"
      | "fontSize"
      | "volume",
    value: number,
  ) => {
    if (!layer || !Number.isFinite(value)) return;
    let next = { ...layer, [key]: value };
    if (["x", "y", "width", "height"].includes(key)) {
      next.width = Math.min(screen.width, Math.max(1, next.width));
      next.height = Math.min(screen.height, Math.max(1, next.height));
      next.x = Math.max(0, Math.min(screen.width - next.width, next.x));
      next.y = Math.max(0, Math.min(screen.height - next.height, next.y));
    }
    updateLayer(next);
  };
  return (
    <div className="editor">
      <header className="editor-header">
        <button
          className="icon-button"
          aria-label={t("Back to programs", "กลับไปหน้าโปรแกรม")}
          onClick={() => {
            if (dirty) setModal("leave");
            else onClose();
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="editor-title">
          <input
            value={program.name}
            disabled={!editable}
            maxLength={120}
            aria-label={t("Program name", "ชื่อโปรแกรม")}
            onChange={(e) => change({ ...program, name: e.target.value })}
          />
          <small>
            {dirty
              ? t("Unsaved changes", "ยังไม่บันทึก")
              : t("Draft saved", "บันทึกฉบับร่างแล้ว")}{" "}
            · v{program.version}
          </small>
        </div>
        <div className="editor-tools">
          <button
            className="icon-button"
            aria-label={t("Undo", "เลิกทำ")}
            disabled={!past.length}
            onClick={undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            aria-label={t("Redo", "ทำซ้ำ")}
            disabled={!future.length}
            onClick={redo}
          >
            <Redo2 size={17} />
          </button>
          <button className="button" onClick={() => setModal("preview")}>
            <Play size={14} />
            {t("Preview", "ตัวอย่าง")}
          </button>
          {editable && (
            <button
              className="button"
              disabled={!dirty || saving}
              onClick={() => run(save)}
            >
              <Save size={14} />
              {saving ? t("Saving…", "บันทึก…") : t("Save draft", "บันทึกร่าง")}
            </button>
          )}
          {canOperate(state) && (
            <button
              className="button primary"
              onClick={() => {
                if (dirty)
                  void run(async () => {
                    await save();
                    setModal("publish");
                  });
                else setModal("publish");
              }}
            >
              <Send size={14} />
              {t("Publish", "เผยแพร่")}
            </button>
          )}
          <button
            className="icon-button"
            aria-label={t("Program actions", "คำสั่งโปรแกรม")}
            onClick={() => setModal("actions")}
          >
            <MoreHorizontal size={19} />
          </button>
        </div>
      </header>
      <div className="editor-body">
        <aside className="layers-panel">
          <div className="panel-heading">
            <strong>{t("Screens & layers", "หน้าจอและเลเยอร์")}</strong>
            {editable && program.type !== "ordinary" && (
              <button
                className="icon-button"
                aria-label={t("Add screen layout", "เพิ่มหน้าจอ")}
                onClick={() => {
                  const next = blankProgram(
                    "Screen",
                    screen.width,
                    screen.height,
                  ).screens[0];
                  next.name = `Screen ${program.screens.length + 1}`;
                  change({ ...program, screens: [...program.screens, next] });
                  setScreenId(next.id);
                  setLayerId(null);
                }}
              >
                <Plus size={15} />
              </button>
            )}
          </div>
          {program.screens.map((s) => (
            <div key={s.id}>
              <button
                className={`screen-layer-heading ${s.id === screen.id ? "selected" : ""}`}
                onClick={() => {
                  setScreenId(s.id);
                  setLayerId(null);
                }}
              >
                <Monitor size={14} />
                <span>{s.name}</span>
                <small>{s.layers.length}</small>
              </button>
              {s.id === screen.id && (
                <>
                  {s.layers
                    .slice()
                    .reverse()
                    .map((l) => (
                      <div
                        key={l.id}
                        className={`layer-item ${layerId === l.id ? "selected" : ""}`}
                      >
                        <button onClick={() => setLayerId(l.id)}>
                          <Layers size={14} />
                          <span>{l.name}</span>
                        </button>
                        <button
                          className="tiny-button"
                          aria-label={t(
                            "Toggle layer visibility",
                            "เปิด–ปิดเลเยอร์",
                          )}
                          disabled={!editable}
                          onClick={() => {
                            setLayerId(l.id);
                            updateScreen({
                              layers: screen.layers.map((x) =>
                                x.id === l.id ? { ...x, hidden: !x.hidden } : x,
                              ),
                            });
                          }}
                        >
                          {l.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </div>
                    ))}
                  {!s.layers.length && (
                    <p className="layer-empty">
                      {t(
                        "No layers yet. Add your first image, video or text.",
                        "ยังไม่มีเลเยอร์ เพิ่มภาพ วิดีโอ หรือข้อความได้เลย",
                      )}
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
          {editable && (
            <div className="add-layer-panel">
              <h3>{t("Add content", "เพิ่มเนื้อหา")}</h3>
              <div className="quick-widgets">
                {[
                  {
                    type: "image" as const,
                    icon: Image,
                    en: "Image",
                    th: "รูปภาพ",
                  },
                  {
                    type: "video" as const,
                    icon: Film,
                    en: "Video",
                    th: "วิดีโอ",
                  },
                  {
                    type: "text" as const,
                    icon: Type,
                    en: "Text",
                    th: "ข้อความ",
                  },
                  {
                    type: "clock" as const,
                    icon: Clock,
                    en: "Clock",
                    th: "นาฬิกา",
                  },
                ].map((w) => (
                  <button key={w.type} onClick={() => addLayer(w.type)}>
                    <w.icon size={18} />
                    {t(w.en, w.th)}
                  </button>
                ))}
              </div>
              <select
                value=""
                aria-label={t("More widgets", "วิดเจ็ตเพิ่มเติม")}
                onChange={(e) => {
                  if (e.target.value) addLayer(e.target.value as Layer["type"]);
                }}
              >
                <option value="">
                  {t("More widgets…", "วิดเจ็ตเพิ่มเติม…")}
                </option>
                {widgetTypes
                  .filter(
                    (x) => !["image", "video", "text", "clock"].includes(x),
                  )
                  .map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className="layer-bottom">
            <button
              className="button subtle full"
              onClick={() => setModal("schedule")}
            >
              <CalendarClock size={15} />
              {t("Playback schedule", "ตารางเล่นเนื้อหา")}
            </button>
            <button
              className="button subtle full"
              onClick={() =>
                run(async () => {
                  setRevisions(await api(`/programs/${program.id}/revisions`));
                  setModal("history");
                })
              }
            >
              <History size={15} />
              {t("Version history", "ประวัติเวอร์ชัน")}
            </button>
          </div>
        </aside>
        <section className="canvas-workspace">
          <div className="canvas-toolbar">
            <span>
              <MousePointer2 size={15} />
              {t("Select & move", "เลือกและย้าย")}
            </span>
            <div className="inline">
              <small>
                {screen.width} × {screen.height}
              </small>
              <select
                value={zoom}
                aria-label={t("Canvas zoom", "ขยายพื้นที่ออกแบบ")}
                onChange={(e) => setZoom(Number(e.target.value))}
              >
                {[50, 75, 100, 125, 150, 200].map((z) => (
                  <option key={z} value={z}>
                    {z === 100 ? t("Fit", "พอดี") : z + "%"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="canvas-scroll" onPointerDown={() => setLayerId(null)}>
            <div
              className="canvas-frame"
              style={{
                width: `${(Math.min(600, (screen.width / screen.height) * 590) * zoom) / 100}px`,
              }}
            >
              <div className="canvas-label">
                {screen.name}
                <span>{t("Draft canvas", "พื้นที่ฉบับร่าง")}</span>
              </div>
              <div
                className="design-canvas"
                ref={canvas}
                style={{
                  aspectRatio: `${screen.width}/${screen.height}`,
                  background: screen.background,
                }}
              >
                <LayoutPreview layout={screen} media={state.media} />
                {screen.layers
                  .filter((l) => !l.hidden)
                  .map((l) => (
                    <div
                      key={l.id}
                      className={`layer-hitbox ${l.id === layerId ? "active" : ""} ${l.locked ? "locked" : ""}`}
                      style={{
                        left: `${(l.x / screen.width) * 100}%`,
                        top: `${(l.y / screen.height) * 100}%`,
                        width: `${(l.width / screen.width) * 100}%`,
                        height: `${(l.height / screen.height) * 100}%`,
                        transform: `rotate(${l.rotation}deg)`,
                      }}
                      onPointerDown={(e) => pointerDown(e, l)}
                      onPointerMove={pointerMove}
                      onPointerUp={pointerUp}
                      onPointerCancel={pointerUp}
                    >
                      {l.id === layerId && (
                        <>
                          {(["tl", "tr", "bl", "br"] as const).map((corner) => (
                            <span
                              key={corner}
                              className={`layer-handle ${corner}`}
                              onPointerDown={(e) => pointerDown(e, l, corner)}
                            />
                          ))}
                          <span className="layer-dimensions">
                            {l.width} × {l.height}
                          </span>
                        </>
                      )}
                    </div>
                  ))}
              </div>
              <p className="canvas-note">
                {t(
                  "Draft only · save and publish separately",
                  "ฉบับร่างเท่านั้น · บันทึกและเผยแพร่แยกกัน",
                )}
              </p>
            </div>
          </div>
        </section>
        <aside className="properties-panel">
          <div className="panel-heading">
            <strong>
              {layer
                ? t("Layer properties", "คุณสมบัติเลเยอร์")
                : t("Screen properties", "คุณสมบัติหน้าจอ")}
            </strong>
            <Settings2 size={15} />
          </div>
          <div className="property-body">
            {layer ? (
              <>
                <Field label={t("Layer name", "ชื่อเลเยอร์")}>
                  <input
                    disabled={!editable}
                    value={layer.name}
                    maxLength={120}
                    onChange={(e) => updateLayer({ name: e.target.value })}
                  />
                </Field>
                <div className="property-section">
                  <h3>{t("Position & size", "ตำแหน่งและขนาด")}</h3>
                  <div className="two-columns">
                    {(["x", "y", "width", "height"] as const).map((key) => (
                      <Field
                        key={key}
                        label={
                          {
                            x: "X",
                            y: "Y",
                            width: t("Width", "กว้าง"),
                            height: t("Height", "สูง"),
                          }[key]
                        }
                      >
                        <input
                          type="number"
                          value={layer[key]}
                          min={key === "width" || key === "height" ? 1 : 0}
                          max={
                            key === "x" || key === "width"
                              ? screen.width
                              : screen.height
                          }
                          disabled={!editable || layer.locked}
                          onChange={(e) => numeric(key, Number(e.target.value))}
                        />
                      </Field>
                    ))}
                  </div>
                  <div className="two-columns">
                    <Field label={t("Rotation", "การหมุน")}>
                      <input
                        type="number"
                        value={layer.rotation}
                        min="-360"
                        max="360"
                        disabled={!editable}
                        onChange={(e) =>
                          numeric("rotation", Number(e.target.value))
                        }
                      />
                    </Field>
                    <Field label={t("Opacity", "ความทึบ")}>
                      <input
                        type="number"
                        value={Math.round(layer.opacity * 100)}
                        min="0"
                        max="100"
                        disabled={!editable}
                        onChange={(e) =>
                          numeric("opacity", Number(e.target.value) / 100)
                        }
                      />
                    </Field>
                  </div>
                  <div className="inline">
                    <button
                      className="button small-button"
                      disabled={!editable}
                      onClick={() => updateLayer({ locked: !layer.locked })}
                    >
                      {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}{" "}
                      {layer.locked
                        ? t("Locked", "ล็อก")
                        : t("Unlocked", "ไม่ล็อก")}
                    </button>
                    <button
                      className="icon-button"
                      disabled={!editable}
                      aria-label={t("Bring forward", "เลื่อนไปข้างหน้า")}
                      onClick={() => reorder(layer.id, 1)}
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={!editable}
                      aria-label={t("Send backward", "เลื่อนไปข้างหลัง")}
                      onClick={() => reorder(layer.id, -1)}
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>
                </div>
                {layer.type === "text" && (
                  <div className="property-section">
                    <h3>{t("Text", "ข้อความ")}</h3>
                    <textarea
                      value={layer.text}
                      disabled={!editable}
                      onChange={(e) => updateLayer({ text: e.target.value })}
                      rows={5}
                      aria-label={t("Text content", "เนื้อหาข้อความ")}
                    />
                    <Field label={t("Font size", "ขนาดตัวอักษร")}>
                      <input
                        type="number"
                        min="8"
                        max="1000"
                        value={layer.fontSize}
                        disabled={!editable}
                        onChange={(e) =>
                          numeric("fontSize", Number(e.target.value))
                        }
                      />
                    </Field>
                    <div className="two-columns">
                      <Field label={t("Text color", "สีข้อความ")}>
                        <input
                          type="color"
                          value={layer.color}
                          disabled={!editable}
                          onChange={(e) =>
                            updateLayer({ color: e.target.value })
                          }
                        />
                      </Field>
                      <Field label={t("Background", "พื้นหลัง")}>
                        <input
                          type="color"
                          value={layer.background}
                          disabled={!editable}
                          onChange={(e) =>
                            updateLayer({ background: e.target.value })
                          }
                        />
                      </Field>
                    </div>
                  </div>
                )}
                {["image", "video", "mixed", "document"].includes(
                  layer.type,
                ) && (
                  <div className="property-section">
                    <h3>
                      {t("Media sequence", "ลำดับสื่อ")}{" "}
                      <small>{layer.mediaIds.length}</small>
                    </h3>
                    <div className="sequence">
                      {layer.mediaIds.map((id, index) => (
                        <div key={`${id}-${index}`}>
                          <span>{index + 1}</span>
                          <strong>
                            {state.media.find((m) => m.id === id)?.name ?? id}
                          </strong>
                          {editable && (
                            <>
                              <button
                                className="tiny-button"
                                disabled={index === 0}
                                aria-label={t("Move earlier", "เลื่อนขึ้น")}
                                onClick={() => {
                                  const ids = [...layer.mediaIds];
                                  [ids[index], ids[index - 1]] = [
                                    ids[index - 1],
                                    ids[index],
                                  ];
                                  updateLayer({ mediaIds: ids });
                                }}
                              >
                                <ChevronUp size={12} />
                              </button>
                              <button
                                className="tiny-button"
                                aria-label={t(
                                  "Remove from layer",
                                  "นำออกจากเลเยอร์",
                                )}
                                onClick={() =>
                                  updateLayer({
                                    mediaIds: layer.mediaIds.filter(
                                      (_, i) => i !== index,
                                    ),
                                  })
                                }
                              >
                                ×
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                    {editable && (
                      <div className="inline">
                        <button
                          className="button small-button"
                          onClick={() => {
                            setReplaceMedia(false);
                            setModal("media");
                          }}
                        >
                          <Plus size={14} />
                          {t("Add", "เพิ่ม")}
                        </button>
                        <button
                          className="button small-button"
                          onClick={() => {
                            setReplaceMedia(true);
                            setModal("media");
                          }}
                        >
                          {t("Replace all", "แทนที่ทั้งหมด")}
                        </button>
                      </div>
                    )}
                    <Field label={t("Fit", "การปรับภาพ")}>
                      <select
                        value={layer.fit}
                        disabled={!editable}
                        onChange={(e) =>
                          updateLayer({ fit: e.target.value as Layer["fit"] })
                        }
                      >
                        <option value="contain">
                          {t("Fit inside", "พอดีด้านใน")}
                        </option>
                        <option value="cover">
                          {t("Fill & crop", "เต็มพื้นที่และครอบตัด")}
                        </option>
                        <option value="fill">{t("Stretch", "ยืดเต็ม")}</option>
                      </select>
                    </Field>
                    <Field label={t("Seconds per item", "วินาทีต่อรายการ")}>
                      <input
                        type="number"
                        min="0.1"
                        max="86400"
                        step="0.1"
                        value={layer.duration}
                        disabled={!editable}
                        onChange={(e) =>
                          numeric("duration", Number(e.target.value))
                        }
                      />
                    </Field>
                    {["video", "mixed"].includes(layer.type) && (
                      <Field label={t("Video volume", "ระดับเสียงวิดีโอ")}>
                        <input
                          type="range"
                          value={layer.volume}
                          min="0"
                          max="100"
                          disabled={!editable}
                          onChange={(e) =>
                            numeric("volume", Number(e.target.value))
                          }
                        />
                      </Field>
                    )}
                  </div>
                )}
                {![
                  "image",
                  "video",
                  "mixed",
                  "text",
                  "clock",
                  "document",
                ].includes(layer.type) && (
                  <div className="property-section">
                    <h3>{t("Advanced widget", "วิดเจ็ตขั้นสูง")}</h3>
                    <p className="micro">
                      {t(
                        "Stored in your draft. Player support and rendering must be verified during commissioning. Remote content is not executed in this editor.",
                        "บันทึกในฉบับร่างแล้ว ต้องตรวจสอบการรองรับบนจอจริง ตัวแก้ไขนี้ไม่รันเนื้อหาระยะไกล",
                      )}
                    </p>
                    <Field label={t("Source / value", "แหล่งข้อมูล / ค่า")}>
                      <textarea
                        value={String(layer.config.source ?? "")}
                        disabled={!editable}
                        onChange={(e) =>
                          updateLayer({
                            config: { ...layer.config, source: e.target.value },
                          })
                        }
                        rows={4}
                      />
                    </Field>
                  </div>
                )}
                {editable && (
                  <div className="property-section">
                    <button
                      className="button full"
                      onClick={() => {
                        const copy = {
                          ...structuredClone(layer),
                          id: crypto.randomUUID(),
                          name: layer.name.slice(0, 110) + " copy",
                        };
                        updateScreen({ layers: [...screen.layers, copy] });
                        setLayerId(copy.id);
                      }}
                    >
                      <Copy size={14} />
                      {t("Duplicate layer", "ทำสำเนาเลเยอร์")}
                    </button>
                    <button
                      className="button full danger-text"
                      onClick={() => {
                        updateScreen({
                          layers: screen.layers.filter((l) => l.id !== layerId),
                        });
                        setLayerId(null);
                      }}
                    >
                      <Trash2 size={14} />
                      {t("Remove layer", "นำเลเยอร์ออก")}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <Field label={t("Screen name", "ชื่อหน้าจอ")}>
                  <input
                    value={screen.name}
                    disabled={!editable}
                    onChange={(e) => updateScreen({ name: e.target.value })}
                  />
                </Field>
                <div className="two-columns">
                  <Field label={t("Width", "ความกว้าง")}>
                    <input
                      type="number"
                      min="64"
                      max="16384"
                      value={screen.width}
                      disabled={!editable || screen.layers.length > 0}
                      onChange={(e) =>
                        updateScreen({ width: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label={t("Height", "ความสูง")}>
                    <input
                      type="number"
                      min="64"
                      max="16384"
                      value={screen.height}
                      disabled={!editable || screen.layers.length > 0}
                      onChange={(e) =>
                        updateScreen({ height: Number(e.target.value) })
                      }
                    />
                  </Field>
                </div>
                <Field label={t("Background", "พื้นหลัง")}>
                  <input
                    type="color"
                    value={screen.background}
                    disabled={!editable}
                    onChange={(e) =>
                      updateScreen({ background: e.target.value })
                    }
                  />
                </Field>
                <p className="micro">
                  {t(
                    "Select a layer to edit its content and position. Size is locked while layers exist so content is not clipped accidentally.",
                    "เลือกเลเยอร์เพื่อแก้ไขเนื้อหาและตำแหน่ง ล็อกขนาดหน้าจอเมื่อมีเลเยอร์เพื่อป้องกันเนื้อหาถูกตัด",
                  )}
                </p>
                <div className="property-section">
                  <h3>{t("Program details", "รายละเอียดโปรแกรม")}</h3>
                  <dl className="settings-list">
                    <div>
                      <dt>{t("Type", "ประเภท")}</dt>
                      <dd>{program.type}</dd>
                    </div>
                    <div>
                      <dt>{t("Status", "สถานะ")}</dt>
                      <dd>{program.status}</dd>
                    </div>
                    <div>
                      <dt>{t("Last saved", "บันทึกล่าสุด")}</dt>
                      <dd>{formatDate(program.updatedAt, lang)}</dd>
                    </div>
                  </dl>
                </div>
                {editable && program.screens.length > 1 && (
                  <button
                    className="button danger-text full"
                    onClick={() => {
                      change({
                        ...program,
                        screens: program.screens.filter(
                          (s) => s.id !== screen.id,
                        ),
                      });
                      setScreenId(
                        program.screens.find((s) => s.id !== screen.id)!.id,
                      );
                    }}
                  >
                    <Trash2 size={14} />
                    {t("Remove this layout", "ลบหน้าจอนี้")}
                  </button>
                )}
                <div className="notice">
                  {t(
                    "Clear program removes all layers across every screen, but keeps the name, dimensions and shared files.",
                    "ล้างโปรแกรมจะนำเลเยอร์ทุกหน้าจอออก แต่เก็บชื่อ ขนาด และไฟล์ร่วมไว้",
                  )}
                </div>
                {editable && (
                  <button
                    className="button danger-text full"
                    onClick={() => setModal("clear")}
                  >
                    <Trash2 size={14} />
                    {t("Clear program", "ล้างโปรแกรม")}
                  </button>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
      {modal === "media" && layer && (
        <MediaPicker
          allowed={
            layer.type === "image"
              ? ["image"]
              : layer.type === "video"
                ? ["video"]
                : layer.type === "document"
                  ? ["document"]
                  : ["image", "video"]
          }
          onClose={() => setModal(null)}
          onSelect={(ids) => {
            updateLayer({
              mediaIds: replaceMedia ? ids : [...layer.mediaIds, ...ids],
            });
            setModal(null);
          }}
        />
      )}
      {modal === "preview" && (
        <Modal
          title={t("Draft preview", "ตัวอย่างฉบับร่าง")}
          onClose={() => setModal(null)}
          wide
        >
          <div className="modal-body">
            <div className="notice">
              {t(
                "Browser preview only. Advanced widgets, player codecs and physical playback require test-screen validation. Video preview is muted.",
                "เป็นตัวอย่างในเบราว์เซอร์ ต้องทดสอบวิดเจ็ต ตัวถอดรหัส และภาพบนจอจริง ตัวอย่างวิดีโอปิดเสียง",
              )}
            </div>
            <div className="full-preview">
              <LayoutPreview layout={screen} media={state.media} playing />
            </div>
          </div>
        </Modal>
      )}
      {modal === "publish" && (
        <PublishDialog program={program} onClose={() => setModal(null)} />
      )}
      {modal === "clear" && (
        <Confirm
          title={t(
            "Clear all content from this program?",
            "ล้างเนื้อหาทั้งหมดของโปรแกรมนี้?",
          )}
          description={t(
            "All layers and media references in every layout will be removed. The program name, dimensions, shared files, screen playback and power schedules stay unchanged. A saved revision remains available. Unsaved edits will be discarded.",
            "นำเลเยอร์และการอ้างอิงสื่อทุกหน้าจอออก โดยเก็บชื่อ ขนาด และไฟล์ร่วมไว้ ไม่เปลี่ยนภาพที่กำลังเล่นหรือตารางเปิด–ปิด กู้คืนเวอร์ชันที่บันทึกไว้ได้ การแก้ไขที่ยังไม่บันทึกจะหายไป",
          )}
          label={t("Clear draft content", "ล้างเนื้อหาฉบับร่าง")}
          danger
          onClose={() => setModal(null)}
          onConfirm={async () => {
            const p = await api<Program>(
              `/programs/${program.id}/clear`,
              "POST",
              { version: program.version, confirm: "CLEAR" },
            );
            accept(p);
            setLayerId(null);
            await refresh();
            setModal(null);
            notify(
              t(
                "Program cleared. Shared media and screens were not changed.",
                "ล้างโปรแกรมแล้ว ไฟล์ร่วมและหน้าจอไม่เปลี่ยนแปลง",
              ),
            );
          }}
        />
      )}
      {modal === "leave" && (
        <Confirm
          title={t("Leave without saving?", "ออกโดยไม่บันทึกหรือไม่?")}
          description={t(
            "Your latest unsaved edits will be discarded. The last saved draft remains.",
            "การแก้ไขที่ยังไม่บันทึกจะหายไป ฉบับร่างที่บันทึกล่าสุดยังอยู่",
          )}
          label={t("Discard unsaved changes", "ทิ้งการแก้ไขที่ยังไม่บันทึก")}
          danger
          onClose={() => {
            pendingNavigation.current = null;
            setModal(null);
          }}
          onConfirm={async () => {
            if (pendingNavigation.current) pendingNavigation.current();
            else onClose();
          }}
        />
      )}
      {modal === "actions" && (
        <Modal
          title={t("Program actions", "คำสั่งโปรแกรม")}
          onClose={() => setModal(null)}
        >
          <div className="modal-body action-list">
            {editable && (
              <>
                <button
                  className="button full"
                  onClick={() =>
                    run(async () => {
                      if (dirty) await save();
                      const current = await api<{ version: number }[]>(
                        "/programs/" + program.id + "/revisions",
                      );
                      const version = dirty
                        ? Math.max(...current.map((r) => r.version))
                        : program.version;
                      await api(`/programs/${program.id}/action`, "POST", {
                        action: "duplicate",
                        version,
                      });
                      setModal(null);
                    })
                  }
                >
                  <Copy size={16} />
                  {t("Duplicate saved program", "ทำสำเนาโปรแกรมที่บันทึก")}
                </button>
                <button
                  className="button full"
                  onClick={() =>
                    run(async () => {
                      const p = dirty ? await save() : program;
                      accept(
                        await api(`/programs/${p.id}/action`, "POST", {
                          action: "submit",
                          version: p.version,
                        }),
                      );
                      setModal(null);
                    })
                  }
                >
                  <Send size={16} />
                  {t("Submit for review", "ส่งตรวจอนุมัติ")}
                </button>
                <button
                  className="button full danger-text"
                  onClick={() => setModal("clear")}
                >
                  <Trash2 size={16} />
                  {t("Clear program content", "ล้างเนื้อหาโปรแกรม")}
                </button>
                <button
                  className="button full danger-text"
                  onClick={() => setModal("archive")}
                >
                  <Trash2 size={16} />
                  {t("Archive from library", "เก็บออกจากคลัง")}
                </button>
              </>
            )}
            {["owner", "reviewer"].includes(state.user.role) &&
              program.status === "submitted" && (
                <button
                  className="button primary full"
                  onClick={() =>
                    run(async () => {
                      accept(
                        await api(`/programs/${program.id}/action`, "POST", {
                          action: "approve",
                          version: program.version,
                        }),
                      );
                      setModal(null);
                    })
                  }
                >
                  {t("Approve saved version", "อนุมัติเวอร์ชันที่บันทึก")}
                </button>
              )}
            {canOperate(state) && (
              <button
                className="button full danger-text"
                onClick={() => setModal("remove")}
              >
                <Monitor size={16} />
                {t("Remove from selected screens…", "นำออกจากหน้าจอที่เลือก…")}
              </button>
            )}
            <p className="micro">
              {t(
                "Library actions and screen actions are separate. Archiving a draft does not stop anything playing.",
                "คำสั่งในคลังและบนจอแยกกัน เก็บฉบับร่างออกจากคลังไม่ทำให้จอหยุดเล่น",
              )}
            </p>
          </div>
        </Modal>
      )}
      {modal === "archive" && (
        <Confirm
          title={t("Archive this program?", "เก็บโปรแกรมนี้ออกจากคลัง?")}
          description={t(
            "Move the saved program to the recoverable archive. Screens keep their current content. Unsaved changes will be discarded.",
            "ย้ายโปรแกรมที่บันทึกไปยังที่เก็บถาวรและกู้คืนได้ จอยังคงเล่นเนื้อหาเดิม การแก้ไขที่ยังไม่บันทึกจะหายไป",
          )}
          label={t("Archive from library", "เก็บออกจากคลัง")}
          danger
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await api(`/programs/${program.id}/action`, "POST", {
              action: "archive",
              version: program.version,
            });
            await refresh();
            onClose();
          }}
        />
      )}
      {modal === "remove" && (
        <PublishDialog
          program={program}
          remove
          onClose={() => setModal(null)}
        />
      )}
      {modal === "history" && (
        <Modal
          title={t("Version history", "ประวัติเวอร์ชัน")}
          onClose={() => setModal(null)}
        >
          <div className="modal-body history-list">
            {revisions.map((r) => (
              <div key={r.id}>
                <div>
                  <strong>
                    v{r.version} · {r.name}
                  </strong>
                  <small>
                    {formatDate(r.updatedAt, lang)} ·{" "}
                    {r.screens.reduce((n, s) => n + s.layers.length, 0)}{" "}
                    {t("layers", "เลเยอร์")}
                  </small>
                </div>
                {editable && (
                  <button
                    className="button"
                    onClick={() =>
                      run(async () => {
                        accept(
                          await api(`/programs/${program.id}/action`, "POST", {
                            action: "restore_revision",
                            version: program.version,
                            revisionId: r.id,
                          }),
                        );
                        setModal(null);
                      })
                    }
                  >
                    {t("Restore draft", "กู้คืนฉบับร่าง")}
                  </button>
                )}
              </div>
            ))}
          </div>
        </Modal>
      )}
      {modal === "schedule" && (
        <PlaybackDialog
          program={program}
          onClose={() => setModal(null)}
          onSave={(schedule) => {
            change({ ...program, schedule });
            setModal(null);
          }}
        />
      )}
    </div>
  );
}

export function PublishDialog({
  program,
  remove = false,
  playlist,
  onClose,
}: {
  program?: Program;
  remove?: boolean;
  playlist?: { id: string; name: string; deviceIds: string[] };
  onClose: () => void;
}) {
  const { state, t, refresh, notify } = useFleet();
  const [selected, setSelected] = useState<string[]>(playlist?.deviceIds ?? []),
    [mode, setMode] = useState("append"),
    [allowFit, setAllowFit] = useState(false),
    [confirmEmpty, setConfirmEmpty] = useState(false),
    [confirmReplace, setConfirmReplace] = useState(false),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const key = useRef(crypto.randomUUID());
  const devices = state.devices.filter((d) => selected.includes(d.id)),
    empty = program?.screens.every((s) => !s.layers.length);
  return (
    <Modal
      title={
        remove
          ? t("Remove program from screens", "นำโปรแกรมออกจากหน้าจอ")
          : t("Review & publish", "ตรวจสอบและเผยแพร่")
      }
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("/jobs", "POST", {
              command: remove
                ? "remove_program"
                : playlist
                  ? "publish_playlist"
                  : "publish_program",
              targetIds: selected,
              payload: remove
                ? { programId: program!.id, confirm: "REMOVE" }
                : playlist
                  ? { playlistId: playlist.id, confirm: "PUBLISH" }
                  : {
                      programId: program!.id,
                      version: program!.version,
                      mode,
                      allowFit,
                      confirmEmpty,
                      confirm: "PUBLISH",
                      confirmReplace: confirmReplace ? "REPLACE" : undefined,
                    },
              idempotencyKey: key.current,
            });
            await refresh();
            notify(
              t(
                "Job queued. Watch Activity for verified per-screen results.",
                "เข้าคิวแล้ว ดูผลยืนยันของแต่ละจอในกิจกรรม",
              ),
            );
            onClose();
          } catch (e) {
            setError((e as Error).message);
            key.current = crypto.randomUUID();
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <div className="publish-summary">
            <Layers size={23} />
            <div>
              <strong>{program?.name ?? playlist?.name}</strong>
              <small>
                {program
                  ? `v${program.version} · ${program.screens[0].width} × ${program.screens[0].height}`
                  : t("Playlist", "เพลย์ลิสต์")}
              </small>
            </div>
            <Badge
              tone={state.connection.mode === "training" ? "amber" : "neutral"}
            >
              {state.connection.mode === "training"
                ? t("TRAINING ONLY", "จำลองเท่านั้น")
                : t("REVIEW TARGETS", "ตรวจสอบจอ")}
            </Badge>
          </div>
          <div className="content-toolbar">
            <div className="search">
              <Search size={16} />
              <input
                placeholder={t("Find screens", "ค้นหาหน้าจอ")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value === "all")
                  setSelected(state.devices.map((d) => d.id));
                else if (e.target.value)
                  setSelected(
                    state.devices
                      .filter((d) =>
                        groupDescendants(state.groups, e.target.value).includes(
                          d.groupId ?? "",
                        ),
                      )
                      .map((d) => d.id),
                  );
                e.target.value = "";
              }}
            >
              <option value="">{t("Select a group…", "เลือกกลุ่ม…")}</option>
              <option value="all">{t("All screens", "ทุกหน้าจอ")}</option>
              {state.groups.map((g) => (
                <option value={g.id} key={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="target-picker">
            {state.devices
              .filter((d) =>
                `${d.name} ${d.externalId}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((d) => (
                <label key={d.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(d.id)}
                    onChange={(e) =>
                      setSelected((ids) =>
                        e.target.checked
                          ? [...ids, d.id]
                          : ids.filter((id) => id !== d.id),
                      )
                    }
                  />
                  <span>
                    <strong>{d.name}</strong>
                    <small>
                      {d.externalId} · {d.settings.width} × {d.settings.height}
                    </small>
                  </span>
                  <Badge tone={d.online ? "green" : "neutral"}>
                    {d.online
                      ? t("Online", "ออนไลน์")
                      : t("Offline / unknown", "ออฟไลน์ / ไม่ทราบ")}
                  </Badge>
                </label>
              ))}
          </div>
          {!state.devices.length && (
            <p className="notice">
              {t(
                "No screens are connected. You can keep editing and saving drafts.",
                "ยังไม่มีจอเชื่อมต่อ คุณยังแก้ไขและบันทึกฉบับร่างได้",
              )}
            </p>
          )}
          <TargetList devices={devices} />
          {!remove && !playlist && (
            <>
              <Field label={t("Delivery mode", "รูปแบบการส่ง")}>
                <select
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value);
                    setConfirmReplace(false);
                  }}
                >
                  <option value="append">
                    {t("Append to existing playback", "เพิ่มต่อจากรายการเดิม")}
                  </option>
                  <option value="replace">
                    {t("Replace existing playback", "แทนที่รายการเล่นเดิม")}
                  </option>
                </select>
              </Field>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={allowFit}
                  onChange={(e) => setAllowFit(e.target.checked)}
                />
                {t(
                  "Allow screens with different dimensions (verify fitting on test players)",
                  "อนุญาตจอที่ขนาดต่างกัน (ต้องตรวจสอบการปรับภาพบนจอทดสอบ)",
                )}
              </label>
              {empty && (
                <label className="check-line warning">
                  <input
                    type="checkbox"
                    checked={confirmEmpty}
                    onChange={(e) => setConfirmEmpty(e.target.checked)}
                  />
                  {t(
                    "I intend to publish an empty program.",
                    "ฉันต้องการเผยแพร่โปรแกรมว่าง",
                  )}
                </label>
              )}
              {mode === "replace" && (
                <label className="check-line warning">
                  <input
                    type="checkbox"
                    checked={confirmReplace}
                    onChange={(e) => setConfirmReplace(e.target.checked)}
                  />
                  {t(
                    "I understand this replaces the selected screens’ current playback assignment.",
                    "ฉันเข้าใจว่าจะเปลี่ยนรายการเล่นปัจจุบันของจอที่เลือก",
                  )}
                </label>
              )}
            </>
          )}
          <div className="notice">
            {remove
              ? t(
                  "This removes the program only from these screens. The library draft and shared media are preserved.",
                  "นำโปรแกรมออกจากจอเหล่านี้เท่านั้น เก็บฉบับร่างและสื่อร่วมไว้",
                )
              : t(
                  "Targets and content versions are frozen when queued. Power schedules are not changed. A cloud result is not proof of physical playback.",
                  "ระบบจะล็อกจอและเวอร์ชันเนื้อหาเมื่อเข้าคิว ไม่เปลี่ยนตารางเปิด–ปิด ผลจากคลาวด์ไม่ใช่การยืนยันภาพบนจอจริง",
                )}
          </div>
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
            className={`button ${remove ? "danger" : "primary"}`}
            disabled={
              busy ||
              !selected.length ||
              state.connection.mode === "disconnected" ||
              (!remove &&
                !playlist &&
                ((empty && !confirmEmpty) ||
                  (mode === "replace" && !confirmReplace)))
            }
          >
            {busy
              ? t("Queuing…", "กำลังเข้าคิว…")
              : remove
                ? t("Confirm removal", "ยืนยันนำออก")
                : t("Confirm publish", "ยืนยันเผยแพร่")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function PlaybackDialog({
  program,
  onSave,
  onClose,
}: {
  program: Program;
  onSave: (schedule: Program["schedule"]) => void;
  onClose: () => void;
}) {
  const { t } = useFleet();
  const [enabled, setEnabled] = useState(!!program.schedule),
    [schedule, setSchedule] = useState(
      program.schedule ?? {
        timezone: "Asia/Bangkok",
        days: [1, 2, 3, 4, 5, 6, 7],
        startDate: null,
        endDate: null,
        startTime: "00:00",
        endTime: "23:59",
      },
    );
  return (
    <Modal title={t("Playback schedule", "ตารางเล่นเนื้อหา")} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(enabled ? schedule : null);
        }}
      >
        <div className="modal-body">
          <div className="notice">
            {t(
              "This controls when this program may play. It is separate from screen power. Save and publish to apply it.",
              "กำหนดช่วงเล่นโปรแกรมนี้ แยกจากการเปิด–ปิดจอ ต้องบันทึกและเผยแพร่เพื่อใช้งาน",
            )}
          </div>
          <label className="check-line">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            {t("Limit playback to a schedule", "จำกัดเวลาการเล่น")}
          </label>
          <Field label={t("Timezone", "เขตเวลา")}>
            <input
              value={schedule.timezone}
              onChange={(e) =>
                setSchedule({ ...schedule, timezone: e.target.value })
              }
            />
          </Field>
          <div className="weekdays">
            {[1, 2, 3, 4, 5, 6, 7].map((d, i) => (
              <button
                type="button"
                className={schedule.days.includes(d) ? "selected" : ""}
                key={d}
                onClick={() =>
                  setSchedule({
                    ...schedule,
                    days: schedule.days.includes(d)
                      ? schedule.days.filter((x) => x !== d)
                      : [...schedule.days, d],
                  })
                }
              >
                {t(
                  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i],
                  ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"][i],
                )}
              </button>
            ))}
          </div>
          <div className="two-columns">
            <Field label={t("Start time", "เวลาเริ่ม")}>
              <input
                type="time"
                required
                value={schedule.startTime}
                onChange={(e) =>
                  setSchedule({ ...schedule, startTime: e.target.value })
                }
              />
            </Field>
            <Field label={t("End time", "เวลาจบ")}>
              <input
                type="time"
                required
                value={schedule.endTime}
                onChange={(e) =>
                  setSchedule({ ...schedule, endTime: e.target.value })
                }
              />
            </Field>
            <Field label={t("Start date (optional)", "วันเริ่ม (ไม่บังคับ)")}>
              <input
                type="date"
                value={schedule.startDate ?? ""}
                onChange={(e) =>
                  setSchedule({
                    ...schedule,
                    startDate: e.target.value || null,
                  })
                }
              />
            </Field>
            <Field label={t("End date (optional)", "วันจบ (ไม่บังคับ)")}>
              <input
                type="date"
                value={schedule.endDate ?? ""}
                onChange={(e) =>
                  setSchedule({ ...schedule, endDate: e.target.value || null })
                }
              />
            </Field>
          </div>
        </div>
        <footer>
          <button type="button" className="button" onClick={onClose}>
            {t("Cancel", "ยกเลิก")}
          </button>
          <button
            className="button primary"
            disabled={enabled && !schedule.days.length}
          >
            {t("Keep in draft", "เก็บในฉบับร่าง")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
