import { useRef, useState } from "react";
import {
  Upload,
  Search,
  Image,
  Film,
  Trash2,
  Check,
  Folder,
  X,
  CloudUpload,
  FileText,
  Music,
} from "lucide-react";
import type { Media } from "../shared/domain";
import { api, bytes, canEdit, Field, formatDate, useFleet } from "./context";
import { Badge, Confirm, Empty, MediaThumbnail, Modal } from "./components";

export async function uploadFiles(
  files: File[],
  progress: (message: string) => void,
): Promise<Media[]> {
  const output: Media[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    progress(`${i + 1}/${files.length} · ${file.name}`);
    const form = new FormData();
    form.append("file", file);
    const response = await api<{ media: Media; duplicate: boolean }>(
      "/media",
      "POST",
      form,
    );
    output.push(response.media);
  }
  return output;
}
export function MediaLibrary() {
  const { state, t, lang, run, refresh, notify } = useFleet();
  const [search, setSearch] = useState(""),
    [type, setType] = useState("all"),
    [group, setGroup] = useState("all");
  const [focused, setFocused] = useState<string | null>(null),
    [deleteItem, setDeleteItem] = useState<Media | null>(null),
    [progress, setProgress] = useState("");
  const fileInput = useRef<HTMLInputElement>(null),
    item = state.media.find((m) => m.id === focused);
  const editable = canEdit(state),
    reviewer = ["owner", "reviewer"].includes(state.user.role);
  const media = state.media.filter(
    (m) =>
      `${m.name} ${m.group}`.toLowerCase().includes(search.toLowerCase()) &&
      (type === "all" || m.type === type) &&
      (group === "all" || m.group === group),
  );
  const upload = async (files: File[]) => {
    await run(
      async () => {
        try {
          await uploadFiles(files, setProgress);
        } finally {
          setProgress("");
        }
      },
      t("Files saved to your media library.", "บันทึกไฟล์ลงคลังสื่อแล้ว"),
    );
  };
  return (
    <div className="library-page">
      <header className="page-heading">
        <div>
          <div className="eyebrow">
            {t("A HOME FOR YOUR CONTENT", "รวมเนื้อหาของคุณไว้ที่เดียว")}
          </div>
          <h1>{t("Media library", "คลังสื่อ")}</h1>
          <p>
            {t(
              "Upload once. Reuse across programs without duplicating files.",
              "อัปโหลดครั้งเดียว ใช้ซ้ำได้หลายโปรแกรมโดยไม่ต้องทำสำเนา",
            )}
          </p>
        </div>
        {editable && (
          <button
            className="button primary"
            onClick={() => fileInput.current?.click()}
            disabled={!!progress}
          >
            <Upload size={16} />
            {t("Upload files", "อัปโหลดไฟล์")}
          </button>
        )}
      </header>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav,application/pdf"
        hidden
        onChange={(e) => {
          void upload(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <div className="content-toolbar">
        <div className="search">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search your media", "ค้นหาสื่อ")}
            aria-label={t("Search media", "ค้นหาสื่อ")}
          />
        </div>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label={t("Media type", "ประเภทสื่อ")}
        >
          <option value="all">{t("All types", "ทุกประเภท")}</option>
          <option value="image">{t("Images", "รูปภาพ")}</option>
          <option value="video">{t("Videos", "วิดีโอ")}</option>
          <option value="audio">{t("Audio", "เสียง")}</option>
          <option value="document">{t("Documents", "เอกสาร")}</option>
        </select>
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          aria-label={t("Media folder", "โฟลเดอร์สื่อ")}
        >
          <option value="all">{t("All folders", "ทุกโฟลเดอร์")}</option>
          {[...new Set(state.media.map((m) => m.group))].map((g) => (
            <option key={g} value={g}>
              {g || t("Unfiled", "ยังไม่จัดโฟลเดอร์")}
            </option>
          ))}
        </select>
        <span className="toolbar-spacer" />
        <small>
          {media.length} {t("files", "ไฟล์")}
        </small>
      </div>
      <div
        className={`upload-zone ${progress ? "uploading" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (editable && !progress)
            void upload(Array.from(e.dataTransfer.files));
        }}
      >
        <Upload size={22} />
        <strong>
          {progress ||
            t(
              "Drop images, videos or documents here",
              "วางรูปภาพ วิดีโอ หรือเอกสารที่นี่",
            )}
        </strong>
        <small>
          {t(
            "Up to 512 MB each · files stay in this workspace until you sync them",
            "ไม่เกิน 512 MB ต่อไฟล์ · ไฟล์จะอยู่ในระบบนี้จนกว่าจะสั่งซิงค์",
          )}
        </small>
      </div>
      {media.length ? (
        <div className="media-grid">
          {media.map((m) => (
            <button
              key={m.id}
              className={`media-card ${focused === m.id ? "selected" : ""}`}
              onClick={() => setFocused(m.id)}
            >
              <div className="media-image">
                <MediaThumbnail media={m} />
                <Badge
                  tone={
                    m.review === "approved"
                      ? "green"
                      : m.review === "rejected"
                        ? "red"
                        : "amber"
                  }
                >
                  {m.review === "approved"
                    ? t("Approved", "อนุมัติแล้ว")
                    : m.review === "rejected"
                      ? t("Rejected", "ไม่อนุมัติ")
                      : t("Needs review", "รอตรวจ")}
                </Badge>
              </div>
              <strong>{m.name}</strong>
              <small>
                {bytes(m.size)} · {m.type.toUpperCase()}{" "}
                {m.group && `· ${m.group}`}
              </small>
            </button>
          ))}
        </div>
      ) : (
        <Empty
          icon={<Image size={28} />}
          title={t("Your media, ready to reuse", "คลังสื่อพร้อมใช้ซ้ำ")}
          text={t(
            "Upload an image or video, then add it to any program.",
            "อัปโหลดรูปภาพหรือวิดีโอ แล้วนำไปใช้กับโปรแกรมได้ทันที",
          )}
        />
      )}
      {item && (
        <Modal title={item.name} onClose={() => setFocused(null)} wide>
          <div className="modal-body">
            <div className="media-detail-preview">
              <MediaThumbnail media={item} controls />
            </div>
            <dl className="settings-list">
              <div>
                <dt>{t("File size", "ขนาดไฟล์")}</dt>
                <dd>{bytes(item.size)}</dd>
              </div>
              <div>
                <dt>{t("Uploaded", "อัปโหลดเมื่อ")}</dt>
                <dd>{formatDate(item.createdAt, lang)}</dd>
              </div>
              <div>
                <dt>{t("Cloud copy", "สำเนาบนคลาวด์")}</dt>
                <dd>{item.externalId ?? t("Not synced", "ยังไม่ซิงค์")}</dd>
              </div>
              <div>
                <dt>SHA-256</dt>
                <dd className="mono checksum">{item.checksum}</dd>
              </div>
            </dl>
            {editable && (
              <form
                className="inline"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(
                    () =>
                      api(`/media/${item.id}`, "PATCH", {
                        version: item.version,
                        name: f.get("name"),
                        group: f.get("group"),
                      }),
                    t("Media details saved.", "บันทึกรายละเอียดสื่อแล้ว"),
                  );
                }}
              >
                <Field label={t("Name", "ชื่อ")}>
                  <input
                    name="name"
                    defaultValue={item.name}
                    required
                    maxLength={200}
                  />
                </Field>
                <Field label={t("Folder", "โฟลเดอร์")}>
                  <input
                    name="group"
                    defaultValue={item.group}
                    maxLength={120}
                  />
                </Field>
                <button className="button" type="submit">
                  {t("Save", "บันทึก")}
                </button>
              </form>
            )}
            <div className="notice">
              {t(
                "Replacing media in a program swaps its reference. It never overwrites this shared original. Referenced files are protected from deletion.",
                "การแทนที่สื่อในโปรแกรมจะเปลี่ยนไฟล์ที่อ้างอิง ไม่เขียนทับต้นฉบับร่วม ระบบป้องกันการลบไฟล์ที่ยังใช้งานอยู่",
              )}
            </div>
          </div>
          <footer>
            {editable && (
              <button
                className="button danger-text"
                onClick={() => setDeleteItem(item)}
              >
                <Trash2 size={15} />
                {t("Delete file", "ลบไฟล์")}
              </button>
            )}
            <span className="toolbar-spacer" />
            {reviewer && (
              <>
                <button
                  className="button"
                  onClick={() =>
                    run(() =>
                      api(`/media/${item.id}`, "PATCH", {
                        version: item.version,
                        review: "rejected",
                      }),
                    )
                  }
                >
                  {t("Reject", "ไม่อนุมัติ")}
                </button>
                <button
                  className="button"
                  onClick={() =>
                    run(() =>
                      api(`/media/${item.id}`, "PATCH", {
                        version: item.version,
                        review: "approved",
                      }),
                    )
                  }
                >
                  <Check size={15} />
                  {t("Approve", "อนุมัติ")}
                </button>
              </>
            )}
            {editable && (
              <button
                className="button primary"
                disabled={
                  item.review !== "approved" ||
                  !state.connection.capabilities.includes("upload_media")
                }
                onClick={() =>
                  run(
                    () =>
                      api("/jobs", "POST", {
                        command: "upload_media",
                        targetIds: [],
                        payload: { mediaId: item.id },
                        idempotencyKey: crypto.randomUUID(),
                      }),
                    t(
                      "Cloud upload queued. Check Activity for the result.",
                      "เข้าคิวอัปโหลดคลาวด์แล้ว ตรวจสอบผลในกิจกรรม",
                    ),
                  )
                }
              >
                <CloudUpload size={15} />
                {t("Sync to Xiaohui", "ซิงค์ไป Xiaohui")}
              </button>
            )}
          </footer>
        </Modal>
      )}
      {deleteItem && (
        <Confirm
          title={t("Delete this media file?", "ลบไฟล์สื่อนี้หรือไม่?")}
          description={t(
            "Only unreferenced files can be deleted. The file will move to the local recovery archive; no cloud file is deleted.",
            "ลบได้เฉพาะไฟล์ที่ไม่มีการอ้างอิง ไฟล์จะย้ายไปพื้นที่กู้คืนในเครื่อง ไม่ลบไฟล์บนคลาวด์",
          )}
          label={t("Delete from library", "ลบออกจากคลัง")}
          danger
          onClose={() => setDeleteItem(null)}
          onConfirm={async () => {
            await api(`/media/${deleteItem.id}`, "DELETE");
            await refresh();
            setDeleteItem(null);
            setFocused(null);
            notify(
              t(
                "File moved to the local recovery archive.",
                "ย้ายไฟล์ไปพื้นที่กู้คืนในเครื่องแล้ว",
              ),
            );
          }}
        />
      )}
    </div>
  );
}
export function MediaPicker({
  onSelect,
  onClose,
  allowed = ["image", "video", "audio", "document"],
}: {
  onSelect: (ids: string[]) => void;
  onClose: () => void;
  allowed?: Media["type"][];
}) {
  const { state, t, refresh } = useFleet();
  const [selected, setSelected] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [progress, setProgress] = useState(""),
    [error, setError] = useState("");
  const files = useRef<HTMLInputElement>(null);
  return (
    <Modal
      title={t("Add media to layer", "เพิ่มสื่อในเลเยอร์")}
      onClose={onClose}
      wide
    >
      <div className="modal-body">
        <div className="content-toolbar">
          <div className="search">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search files", "ค้นหาไฟล์")}
            />
          </div>
          <button
            className="button"
            disabled={!!progress}
            onClick={() => files.current?.click()}
          >
            <Upload size={15} />
            {t("Upload new", "อัปโหลดใหม่")}
          </button>
          <input
            ref={files}
            type="file"
            multiple
            hidden
            onChange={async (e) => {
              const list = Array.from(e.target.files ?? []);
              e.target.value = "";
              try {
                const uploaded = await uploadFiles(list, setProgress);
                await refresh();
                setSelected((ids) => [
                  ...ids,
                  ...uploaded
                    .filter((m) => allowed.includes(m.type))
                    .map((m) => m.id),
                ]);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setProgress("");
              }
            }}
          />
        </div>
        {progress && <p>{progress}</p>}
        {error && <p className="error">{error}</p>}
        <div className="media-grid picker">
          {state.media
            .filter(
              (m) =>
                allowed.includes(m.type) &&
                m.name.toLowerCase().includes(search.toLowerCase()),
            )
            .map((m) => (
              <button
                key={m.id}
                className={`media-card ${selected.includes(m.id) ? "selected" : ""}`}
                onClick={() =>
                  setSelected((ids) =>
                    ids.includes(m.id)
                      ? ids.filter((id) => id !== m.id)
                      : [...ids, m.id],
                  )
                }
              >
                <div className="media-image">
                  <MediaThumbnail media={m} />
                  {selected.includes(m.id) && (
                    <span className="selection-number">
                      {selected.indexOf(m.id) + 1}
                    </span>
                  )}
                </div>
                <strong>{m.name}</strong>
                <small>{bytes(m.size)}</small>
              </button>
            ))}
        </div>
      </div>
      <footer>
        <span>
          {selected.length}{" "}
          {t("selected in playback order", "ไฟล์ ตามลำดับการเล่น")}
        </span>
        <span className="toolbar-spacer" />
        <button className="button" onClick={onClose}>
          {t("Cancel", "ยกเลิก")}
        </button>
        <button
          className="button primary"
          disabled={!selected.length || !!progress}
          onClick={() => onSelect(selected)}
        >
          {t("Add selected", "เพิ่มที่เลือก")}
        </button>
      </footer>
    </Modal>
  );
}
