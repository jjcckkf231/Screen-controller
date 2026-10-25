import { useCallback, useEffect, useState } from "react";
import {
  Monitor,
  Layers,
  Image,
  ListVideo,
  Activity,
  Settings,
  Globe,
  LogOut,
  ArrowRight,
  X,
  CircleHelp,
  RefreshCw,
} from "lucide-react";
import type { FleetState, User } from "../shared/domain";
import { api, FleetContext, Field, type Language } from "./context";
import { Devices } from "./Devices";
import { Programs } from "./Programs";
import { MediaLibrary } from "./MediaLibrary";
import { Playlists } from "./Playlists";
import { ActivityPage, SettingsPage } from "./Settings";
import { Badge } from "./components";

export default function App() {
  const [lang, setLang] = useState<Language>(() =>
    localStorage.getItem("fleet-language") === "th" ? "th" : "en",
  );
  const t = useCallback(
    (en: string, th: string) => (lang === "en" ? en : th),
    [lang],
  );
  const [session, setSession] = useState<{
    initialized: boolean;
    user: User | null;
  } | null>(null);
  const [state, setState] = useState<FleetState | null>(null),
    [page, commitPage] = useState("screens");
  const setPage = (next: string) => {
    const event = new CustomEvent("fleet-navigation", {
      cancelable: true,
      detail: { go: () => commitPage(next) },
    });
    if (window.dispatchEvent(event)) commitPage(next);
  };
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    const next = await api<FleetState>("/state");
    setState(next);
  }, []);
  const loadSession = useCallback(async () => {
    try {
      const s = await api<{ initialized: boolean; user: User | null }>(
        "/session",
      );
      setSession(s);
      if (s.user) await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [refresh]);
  useEffect(() => {
    void loadSession();
  }, [loadSession]);
  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem("fleet-language", lang);
  }, [lang]);
  useEffect(() => {
    if (!session?.user) return;
    const timer = setInterval(() => {
      if (!document.hidden)
        void refresh().catch((e) => setError((e as Error).message));
    }, 5000);
    return () => clearInterval(timer);
  }, [session?.user, refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const run = async <T,>(
    operation: () => Promise<T>,
    message?: string,
  ): Promise<T | undefined> => {
    setError("");
    setLoading(true);
    try {
      const result = await operation();
      await refresh();
      if (message) setNotice(message);
      return result;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setLoading(false);
    }
  };
  if (!session || (session.user && !state))
    return (
      <div className="loading-page">
        <div className="brand-mark">
          <i />
          <i />
          <i />
          <i />
        </div>
        <h1>Fleet Studio</h1>
        <p>{error || t("Opening your workspace…", "กำลังเปิดพื้นที่ทำงาน…")}</p>
        {error && (
          <button className="button" onClick={loadSession}>
            {t("Try again", "ลองอีกครั้ง")}
          </button>
        )}
      </div>
    );
  if (!session.user || !state)
    return (
      <Login
        initialized={session.initialized}
        onDone={loadSession}
        lang={lang}
        setLang={setLang}
      />
    );
  const activeJobs = state.jobs.filter((j) =>
    ["queued", "running", "verifying", "awaiting_approval"].includes(j.state),
  ).length;
  const nav = [
    {
      id: "screens",
      icon: Monitor,
      en: "Screens",
      th: "หน้าจอ",
      count: state.devices.length,
    },
    { id: "programs", icon: Layers, en: "Programs", th: "โปรแกรม" },
    { id: "media", icon: Image, en: "Media library", th: "คลังสื่อ" },
    { id: "playlists", icon: ListVideo, en: "Playlists", th: "เพลย์ลิสต์" },
    {
      id: "activity",
      icon: Activity,
      en: "Activity",
      th: "กิจกรรม",
      count: activeJobs || undefined,
    },
  ];
  return (
    <FleetContext.Provider
      value={{
        state,
        t,
        lang,
        refresh,
        run,
        notify: setNotice,
        navigate: setPage,
      }}
    >
      <div className="app-shell">
        <aside className="app-sidebar">
          <div className="brand">
            <div className="brand-mark">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div>
              <strong>Fleet Studio</strong>
              <span>{t("Screen workspace", "พื้นที่จัดการหน้าจอ")}</span>
            </div>
          </div>
          <div className="workspace-chip">
            <span className="avatar">
              {state.user.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{t("My workspace", "พื้นที่ทำงานของฉัน")}</strong>
              <small>
                {state.connection.mode === "training"
                  ? t("Training · no real screens", "ฝึกใช้งาน · ไม่ใช่จอจริง")
                  : state.connection.accountLabel ||
                    t("Ready to create", "พร้อมเริ่มสร้าง")}
              </small>
            </div>
          </div>
          <div className="nav-label">{t("WORKSPACE", "พื้นที่ทำงาน")}</div>
          <nav>
            {nav.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${page === item.id ? "active" : ""}`}
                onClick={() => setPage(item.id)}
              >
                <item.icon size={18} />
                <span>{t(item.en, item.th)}</span>
                {item.count !== undefined && (
                  <span className="nav-count">{item.count}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="connection-note">
              <span
                className={`status-dot ${state.connection.mode === "xiaohui" ? "green" : "amber"}`}
              />
              <strong>
                {state.connection.mode === "training"
                  ? t("Training mode", "โหมดฝึกใช้งาน")
                  : state.connection.mode === "xiaohui"
                    ? t("Xiaohui connected", "เชื่อมต่อ Xiaohui")
                    : t("No fleet connected", "ยังไม่ได้เชื่อมต่อจอ")}
              </strong>
              <p>
                {state.connection.mode === "training"
                  ? t(
                      "Actions affect simulated players only.",
                      "การทำงานมีผลกับจอจำลองเท่านั้น",
                    )
                  : state.connection.mode === "xiaohui"
                    ? t("Cloud reads are connected. Available controls depend on verified workflows.", "เชื่อมต่อการอ่านข้อมูลจากคลาวด์แล้ว ใช้ได้เฉพาะคำสั่งที่ตรวจสอบแล้ว")
                    : t(
                      "Drafts and uploads are saved locally. Connect test screens when ready.",
                      "บันทึกฉบับร่างและสื่อแล้ว เชื่อมต่อจอทดสอบเมื่อพร้อม",
                    )}
              </p>
              <button onClick={() => setPage("settings")}>
                {t("Connection settings", "ตั้งค่าการเชื่อมต่อ")}{" "}
                <ArrowRight size={13} />
              </button>
            </div>
            <button
              className={`nav-item ${page === "settings" ? "active" : ""}`}
              onClick={() => setPage("settings")}
            >
              <Settings size={18} />
              {t("Settings", "ตั้งค่า")}
            </button>
            <button
              className="nav-item"
              onClick={() => setLang(lang === "en" ? "th" : "en")}
            >
              <Globe size={18} />
              {lang === "en" ? "ภาษาไทย" : "English"}
            </button>
            <div className="user-line">
              <span className="avatar small">
                {state.user.name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <strong>{state.user.name}</strong>
                <small>{state.user.role}</small>
              </div>
              <button
                className="icon-button"
                title={t("Sign out", "ออกจากระบบ")}
                aria-label={t("Sign out", "ออกจากระบบ")}
                onClick={async () => {
                  await api("/logout", "POST");
                  setState(null);
                  await loadSession();
                }}
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </aside>
        <main className="app-main">
          <div className="global-bar">
            <div className="breadcrumbs">
              {t("Workspace", "พื้นที่ทำงาน")} <span>/</span>{" "}
              {page === "settings"
                ? t("Settings", "ตั้งค่า")
                : t(
                    nav.find((n) => n.id === page)?.en ?? "",
                    nav.find((n) => n.id === page)?.th ?? "",
                  )}
            </div>
            <div className="inline">
              <span className="save-hint">
                {loading
                  ? t("Saving…", "กำลังบันทึก…")
                  : t("Persistent workspace", "บันทึกข้อมูลถาวร")}
              </span>
              <Badge
                tone={
                  state.connection.mode === "training" ? "amber" : "neutral"
                }
              >
                {state.connection.mode === "training"
                  ? t("TRAINING", "จำลอง")
                  : state.connection.mode === "xiaohui"
                    ? "XIAOHUI"
                    : t("NOT CONNECTED", "ยังไม่เชื่อมต่อ")}
              </Badge>
              <button
                className="icon-button"
                title={t("Refresh saved data", "โหลดข้อมูลล่าสุด")}
                aria-label={t("Refresh saved data", "โหลดข้อมูลล่าสุด")}
                onClick={() => run(refresh)}
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </div>
          {state.connection.paused && (
            <div className="banner warning">
              {t(
                "Connector paused. New operations will not start.",
                "หยุดตัวเชื่อมต่อแล้ว จะไม่เริ่มงานใหม่",
              )}{" "}
              <button onClick={() => setPage("settings")}>
                {t("Review", "ตรวจสอบ")}
              </button>
            </div>
          )}
          {error && (
            <div className="banner error" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="page-content">
            {page === "screens" ? (
              <Devices />
            ) : page === "programs" ? (
              <Programs />
            ) : page === "media" ? (
              <MediaLibrary />
            ) : page === "playlists" ? (
              <Playlists />
            ) : page === "activity" ? (
              <ActivityPage />
            ) : (
              <SettingsPage />
            )}
          </div>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            className="icon-button"
            onClick={() => setNotice("")}
            aria-label="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </FleetContext.Provider>
  );
}
function Login({
  initialized,
  onDone,
  lang,
  setLang,
}: {
  initialized: boolean;
  onDone: () => Promise<void>;
  lang: Language;
  setLang: (lang: Language) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const t = (en: string, th: string) => (lang === "en" ? en : th);
  return (
    <div className="login-page">
      <section className="login-art">
        <div className="brand white">
          <div className="brand-mark">
            <i />
            <i />
            <i />
            <i />
          </div>
          <strong>Fleet Studio</strong>
        </div>
        <div>
          <span className="eyebrow">ONE WORKSPACE. EVERY SCREEN.</span>
          <h1>
            {t(
              "A little less work.\nA lot more control.",
              "จัดการง่ายขึ้น\nควบคุมได้มากขึ้น",
            )}
          </h1>
          <p>
            {t(
              "Your content, your screens, your schedule. A calmer way to manage your fleet.",
              "เนื้อหา หน้าจอ และตารางเวลา จัดการทุกอย่างได้จากพื้นที่ทำงานเดียว",
            )}
          </p>
          <div className="art-screens">
            <div />
            <div />
            <div />
          </div>
        </div>
        <small>TH / EN · Fleet management</small>
      </section>
      <section className="login-form">
        <button
          className="language-button"
          onClick={() => setLang(lang === "en" ? "th" : "en")}
        >
          <Globe size={16} /> {lang === "en" ? "ภาษาไทย" : "English"}
        </button>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const form = new FormData(e.currentTarget);
            try {
              await api(
                initialized ? "/login" : "/setup",
                "POST",
                Object.fromEntries(form.entries()),
              );
              await onDone();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <span className="eyebrow">FLEET STUDIO</span>
          <h2>
            {initialized
              ? t("Welcome back", "ยินดีต้อนรับกลับ")
              : t("Make this workspace yours", "สร้างพื้นที่ทำงานของคุณ")}
          </h2>
          <p>
            {initialized
              ? t(
                  "Sign in to manage your screens and content.",
                  "เข้าสู่ระบบเพื่อจัดการจอและเนื้อหา",
                )
              : t(
                  "Create your local owner account. This is separate from your Xiaohui login.",
                  "สร้างบัญชีเจ้าของสำหรับระบบนี้ แยกจากบัญชี Xiaohui ของคุณ",
                )}
          </p>
          {!initialized && (
            <Field label={t("Your name", "ชื่อของคุณ")}>
              <input name="name" required maxLength={120} autoComplete="name" />
            </Field>
          )}
          <Field label={t("Email", "อีเมล")}>
            <input name="email" type="email" required autoComplete="username" />
          </Field>
          <Field
            label={t("Password", "รหัสผ่าน")}
            hint={
              !initialized
                ? t(
                    "At least 12 characters. Keep this somewhere safe.",
                    "อย่างน้อย 12 ตัวอักษร กรุณาเก็บรหัสผ่านไว้ให้ปลอดภัย",
                  )
                : undefined
            }
          >
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={200}
              autoComplete={initialized ? "current-password" : "new-password"}
            />
          </Field>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary large" disabled={busy}>
            {busy
              ? t("Opening…", "กำลังเปิด…")
              : initialized
                ? t("Sign in", "เข้าสู่ระบบ")
                : t("Create workspace", "สร้างพื้นที่ทำงาน")}
            <ArrowRight size={17} />
          </button>
          <div className="login-safety">
            <CircleHelp size={16} />
            {t(
              "No live fleet actions are enabled until the connector is commissioned.",
              "ระบบจะไม่สั่งงานจอจริงจนกว่าจะตั้งค่าและตรวจสอบตัวเชื่อมต่อ",
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
