import { useState } from "react";
import {
  Plus,
  ListVideo,
  Trash2,
  ChevronUp,
  Send,
  GripVertical,
} from "lucide-react";
import type { Playlist } from "../shared/domain";
import { api, canEdit, canOperate, Field, useFleet } from "./context";
import { Confirm, Empty, Modal } from "./components";
import { PublishDialog } from "./Programs";

export function Playlists() {
  const { state, t, run, refresh } = useFleet();
  const [edit, setEdit] = useState<Partial<Playlist> | null>(null),
    [publish, setPublish] = useState<Playlist | null>(null),
    [remove, setRemove] = useState<Playlist | null>(null);
  return (
    <div className="library-page">
      <header className="page-heading">
        <div>
          <div className="eyebrow">
            {t("CONTENT IN THE RIGHT ORDER", "เนื้อหาตามลำดับที่ต้องการ")}
          </div>
          <h1>{t("Playlists", "เพลย์ลิสต์")}</h1>
          <p>
            {t(
              "Combine programs, choose an order and bind the right screens.",
              "รวมโปรแกรม จัดลำดับ และกำหนดจอที่ต้องการ",
            )}
          </p>
        </div>
        {canEdit(state) && (
          <button
            className="button primary"
            onClick={() => setEdit({ name: "", programIds: [], deviceIds: [] })}
          >
            <Plus size={16} />
            {t("New playlist", "สร้างเพลย์ลิสต์")}
          </button>
        )}
      </header>
      {state.playlists.length ? (
        <div className="playlist-grid">
          {state.playlists.map((p) => (
            <article className="playlist-card" key={p.id}>
              <div className="playlist-icon">
                <ListVideo size={24} />
              </div>
              <h2>{p.name}</h2>
              <small>
                {p.programIds.length} {t("programs", "โปรแกรม")} ·{" "}
                {p.deviceIds.length} {t("bound screens", "จอที่ผูกไว้")}
              </small>
              <ol>
                {p.programIds.map((id, i) => (
                  <li key={`${id}-${i}`}>
                    {state.programs.find((p) => p.id === id)?.name ??
                      t("Missing program", "ไม่พบโปรแกรม")}
                  </li>
                ))}
              </ol>
              <div className="inline">
                {canEdit(state) && (
                  <button
                    className="button"
                    onClick={() => setEdit(structuredClone(p))}
                  >
                    {t("Edit", "แก้ไข")}
                  </button>
                )}
                {canOperate(state) && (
                  <button
                    className="button primary"
                    onClick={() => setPublish(p)}
                  >
                    <Send size={14} />
                    {t("Publish", "เผยแพร่")}
                  </button>
                )}
                <span className="toolbar-spacer" />
                {canEdit(state) && (
                  <button
                    className="icon-button danger-text"
                    aria-label={t("Delete playlist", "ลบเพลย์ลิสต์")}
                    onClick={() => setRemove(p)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={<ListVideo size={28} />}
          title={t(
            "A sequence for every location",
            "จัดชุดเนื้อหาให้แต่ละสถานที่",
          )}
          text={t(
            "Create programs first, then arrange them in a playlist. Publishing is a separate, confirmed action.",
            "สร้างโปรแกรมก่อน แล้วนำมาจัดเป็นเพลย์ลิสต์ การเผยแพร่เป็นขั้นตอนแยกที่ต้องยืนยัน",
          )}
        />
      )}
      {edit && (
        <Modal
          title={
            edit.id
              ? t("Edit playlist", "แก้ไขเพลย์ลิสต์")
              : t("New playlist", "สร้างเพลย์ลิสต์")
          }
          onClose={() => setEdit(null)}
          wide
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api(
                  edit.id ? `/playlists/${edit.id}` : "/playlists",
                  edit.id ? "PUT" : "POST",
                  edit,
                );
                setEdit(null);
              });
            }}
          >
            <div className="modal-body">
              <Field label={t("Name", "ชื่อ")}>
                <input
                  required
                  maxLength={120}
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </Field>
              <h3>{t("Program order", "ลำดับโปรแกรม")}</h3>
              <div className="sequence">
                {edit.programIds!.map((id, i) => (
                  <div key={`${id}-${i}`}>
                    <span>{i + 1}</span>
                    <strong>
                      {state.programs.find((p) => p.id === id)?.name}
                    </strong>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={!i}
                      aria-label={t("Move earlier", "เลื่อนขึ้น")}
                      onClick={() => {
                        const ids = [...edit.programIds!];
                        [ids[i], ids[i - 1]] = [ids[i - 1], ids[i]];
                        setEdit({ ...edit, programIds: ids });
                      }}
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t("Remove program", "นำโปรแกรมออก")}
                      onClick={() =>
                        setEdit({
                          ...edit,
                          programIds: edit.programIds!.filter(
                            (_, j) => j !== i,
                          ),
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <select
                value=""
                aria-label={t("Add program", "เพิ่มโปรแกรม")}
                onChange={(e) => {
                  if (e.target.value)
                    setEdit({
                      ...edit,
                      programIds: [...edit.programIds!, e.target.value],
                    });
                }}
              >
                <option value="">{t("Add a program…", "เพิ่มโปรแกรม…")}</option>
                {state.programs
                  .filter((p) => !p.deletedAt)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <h3>{t("Default target screens", "จอปลายทางเริ่มต้น")}</h3>
              <div className="target-picker">
                {state.devices.map((d) => (
                  <label key={d.id}>
                    <input
                      type="checkbox"
                      checked={edit.deviceIds!.includes(d.id)}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          deviceIds: e.target.checked
                            ? [...edit.deviceIds!, d.id]
                            : edit.deviceIds!.filter((id) => id !== d.id),
                        })
                      }
                    />
                    <span>
                      {d.name}
                      <small>{d.externalId}</small>
                    </span>
                  </label>
                ))}
              </div>
              <div className="notice">
                {t(
                  "Saving a playlist does not publish it. Review its exact targets again when publishing.",
                  "บันทึกเพลย์ลิสต์ไม่ใช่การเผยแพร่ ตรวจสอบจอปลายทางอีกครั้งก่อนเผยแพร่",
                )}
              </div>
            </div>
            <footer>
              <button
                type="button"
                className="button"
                onClick={() => setEdit(null)}
              >
                {t("Cancel", "ยกเลิก")}
              </button>
              <button className="button primary">
                {t("Save playlist", "บันทึกเพลย์ลิสต์")}
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {publish && (
        <PublishDialog playlist={publish} onClose={() => setPublish(null)} />
      )}
      {remove && (
        <Confirm
          title={t("Delete playlist?", "ลบเพลย์ลิสต์?")}
          description={t(
            "This deletes the local playlist definition. Its programs, media and screen playback are unchanged.",
            "ลบเฉพาะการจัดชุดเพลย์ลิสต์ในระบบนี้ ไม่เปลี่ยนโปรแกรม สื่อ และการเล่นบนจอ",
          )}
          label={t("Delete playlist", "ลบเพลย์ลิสต์")}
          danger
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            await api(`/playlists/${remove.id}`, "DELETE");
            await refresh();
            setRemove(null);
          }}
        />
      )}
    </div>
  );
}
