"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { LuArrowUpRight, LuCopy, LuTrash2 } from "react-icons/lu";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import { copyText } from "../../places/board/clipboard";
import { isWebUrl } from "../../places/board/logic";
import { PkButton, PkField, PkSheet } from "../kit";
import { TileFace } from "./Wall";
import {
  type ItemForm,
  KIND_LABEL,
  type PhoneBoardItem,
  formOf,
  itemPatch,
  madeLine,
} from "./model";

const t = strings["phone-habits.jsx"];

/**
 * A reference, opened (PhbItemSheet): look at it, edit its title, note or
 * colour, copy its hex or link, open its source, remove it. The edits are
 * saved when the sheet closes (Done, the scrim, a swipe down): one write with
 * only what changed. A viewer, and a tile from the old canvas, read it only.
 */
export function ItemSheet({
  item,
  board,
  tz,
  saving,
  canEdit,
  onClose,
  onSave,
  onRemove,
}: {
  item: PhoneBoardItem | null;
  board: string;
  tz: string;
  saving: boolean;
  /** EDITOR and above. */
  canEdit: boolean;
  onClose: () => void;
  onSave: (
    item: PhoneBoardItem,
    patch: NonNullable<ReturnType<typeof itemPatch>>
  ) => void;
  onRemove: (item: PhoneBoardItem) => void;
}) {
  const last = useRef<PhoneBoardItem | null>(null);
  if (item) last.current = item;
  const it = item ?? last.current;
  const [f, setF] = useState<ItemForm>({
    title: "",
    text: "",
    colorName: "",
    color: "",
  });
  useLayoutEffect(() => {
    if (item) setF(formOf(item));
    // Reset only when a different reference opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);
  const edit = canEdit && !!it && !it.fromCanvas;
  const label = it ? KIND_LABEL[it.kind] : t.PhbItemSheet.reference;
  const src = it?.source;
  const hexOk = /^#?[0-9a-f]{6}$/i.test(f.color.trim());
  const set = (p: Partial<ItemForm>) => setF((cur) => ({ ...cur, ...p }));

  const close = () => {
    if (edit && item) {
      const patch = itemPatch(item, f);
      if (patch) onSave(item, patch);
    }
    onClose();
  };
  // What the media shows follows the colour being typed.
  const shown =
    it && it.kind === "color" && hexOk
      ? {
          ...it,
          color: `#${f.color.trim().replace(/^#/, "")}`,
          colorName: f.colorName,
        }
      : it;

  return (
    <PkSheet
      open={!!item}
      onClose={close}
      detents={[0.92]}
      label={label}
      title={label}
      meta={
        it
          ? [madeLine(it.createdAt, tz).replace("Made", "Added"), board]
              .filter(Boolean)
              .join(" · ")
          : null
      }
      className="phb-item-sheet"
      footer={
        <>
          {edit ? (
            <PkButton
              icon={<LuTrash2 size={18} aria-hidden />}
              className="phb-danger"
              aria-label={t.PhbItemSheet.remove_from_board}
              disabled={!it || saving}
              onClick={() => it && onRemove(it)}
              data-phb-item-remove
            />
          ) : null}
          <PkButton kind="primary" onClick={close} data-phb-item-done>
            {t.PhbItemSheet.done}
          </PkButton>
        </>
      }
    >
      {it && shown ? (
        <div className="phb-item" data-phb-detail={it.id}>
          {it.kind !== "note" ? (
            <div className="phb-item-media">
              <TileFace it={shown} big />
            </div>
          ) : null}
          {it.kind === "note" ? (
            edit ? (
              <PkField
                label="Note"
                id="phb-item-text"
                multiline
                grow
                rows={4}
                value={f.text}
                onChange={(text) => set({ text })}
                placeholder="Type something…"
              />
            ) : (
              <p className="phb-item-note">{it.text}</p>
            )
          ) : it.kind === "color" ? (
            edit ? (
              <div className="phb-item-pair">
                <PkField
                  label="Name"
                  id="phb-item-cname"
                  value={f.colorName}
                  onChange={(colorName) => set({ colorName })}
                  placeholder="Colour"
                  inputProps={{ autoComplete: "off", enterKeyHint: "done" }}
                />
                <PkField
                  label="Hex"
                  id="phb-item-hex"
                  value={f.color}
                  onChange={(color) => set({ color })}
                  placeholder="#000000"
                  className={hexOk ? undefined : "is-invalid"}
                  inputProps={{
                    autoComplete: "off",
                    enterKeyHint: "done",
                    "aria-invalid": !hexOk,
                    "aria-describedby": hexOk ? undefined : "phb-item-hex-err",
                  }}
                />
                {!hexOk ? (
                  <p id="phb-item-hex-err" role="alert" className="phb-err">
                    Use six hex digits, like #8A8178.
                  </p>
                ) : null}
              </div>
            ) : null
          ) : edit ? (
            <PkField
              label="Title"
              id="phb-item-title"
              value={f.title}
              onChange={(title) => set({ title })}
              placeholder="Untitled"
              inputProps={{ autoComplete: "off", enterKeyHint: "done" }}
            />
          ) : it.title ? (
            <p className="phb-item-title">{it.title}</p>
          ) : null}
          {src?.domain ? (
            <div className="phb-source pk-glass">
              <span className="phb-kind-text">
                <span className="phb-kind-label">{src.name}</span>
                <span className="phb-kind-hint">{src.domain}</span>
              </span>
              {isWebUrl(it.url) ? (
                <a
                  className="phb-open"
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.PhbItemSheet.open}
                  <LuArrowUpRight size={14} aria-hidden />
                </a>
              ) : null}
            </div>
          ) : null}
          {it.kind !== "note" ? (
            edit ? (
              <PkField
                label="Note"
                id="phb-item-note"
                multiline
                grow
                rows={2}
                value={f.text}
                onChange={(text) => set({ text })}
                placeholder="Why this one"
              />
            ) : it.text ? (
              <p className="phb-item-note">{it.text}</p>
            ) : null
          ) : null}
          {it.kind === "color" && it.color ? (
            <PkButton
              kind="chip"
              icon={<LuCopy size={16} aria-hidden />}
              onClick={() =>
                void copyText(
                  (it.color as string).toUpperCase(),
                  `Copied ${(it.color as string).toUpperCase()}`
                )
              }
            >
              Copy hex
            </PkButton>
          ) : isWebUrl(it.url) && it.kind === "link" ? (
            <PkButton
              kind="chip"
              icon={<LuCopy size={16} aria-hidden />}
              onClick={() => void copyText(it.url as string)}
            >
              Copy link
            </PkButton>
          ) : null}
        </div>
      ) : null}
    </PkSheet>
  );
}
