"use client";

import { useEffect, useRef, useState } from "react";

import {
  LuArrowUpRight,
  LuCopy,
  LuLink,
  LuPalette,
  LuPenLine,
  LuTrash2,
  LuUpload,
  LuX,
} from "react-icons/lu";

import { formatInTimeZone } from "@/lib/date-utils";
import type { V3BoardItem } from "@/lib/needt3/hooks/boards";

import { Sheet } from "../../ctx/Sheet";
import { ItemComments } from "./ItemComments";
import { copyText, openUrl } from "./clipboard";
import { isFigma, sourceUrlOf } from "./logic";
import { FavBadge, Visual } from "./parts";

/**
 * A reference, opened (places.jsx `Detail`): a side sheet with the picture,
 * where it came from, a note that saves itself, Copy link / Copy hex, Open
 * source and Remove. A guest, a viewer and a tile from the old canvas read it
 * and change nothing.
 */
export function Detail({
  boardId,
  canModerate,
  item,
  readOnly,
  tz,
  onClose,
  onSave,
  onRemove,
}: {
  boardId: string;
  /** Full access: may resolve or delete anyone's comment. */
  canModerate: boolean;
  item: V3BoardItem | null;
  readOnly: boolean;
  tz: string;
  onClose: () => void;
  /** Resolves true once saved. */
  onSave: (id: string, text: string | null) => Promise<boolean>;
  onRemove: (item: V3BoardItem) => void;
}) {
  // The last item stays drawn while the sheet slides away.
  const last = useRef<V3BoardItem | null>(null);
  if (item) last.current = item;
  const x = item ?? last.current;
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | null>(null);
  const latest = useRef({ note, item, readOnly });
  latest.current = { note, item, readOnly };
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const flush = (value: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const it = latest.current.item;
    if (!it || latest.current.readOnly) return;
    // A note's words cannot be emptied (the route refuses); the caption on any
    // other reference can.
    if (it.kind === "note" && !value.trim()) return;
    void saveRef
      .current(it.id, it.kind === "note" ? value : value.trim() ? value : null)
      .then((ok) => ok && setSaved(true));
  };

  useEffect(() => {
    if (item) {
      setNote(item.text ?? "");
      setSaved(false);
    }
    // Reset only when a different reference opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  // Whatever is typed is saved when the sheet closes or unmounts.
  const close = () => {
    if (timer.current) flush(latest.current.note);
    onClose();
  };
  // Unmounting with a pause still pending (the board page closes under it) saves
  // what was typed instead of dropping it; the write belongs to the controller.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(
    () => () => {
      if (timer.current) flushRef.current(latest.current.note);
    },
    []
  );

  if (!x) return null;
  const src =
    x.kind === "link"
      ? (x.source?.name ?? "Link")
      : x.kind === "image"
        ? (x.source?.name ?? "Uploaded")
        : x.kind === "color"
          ? "Colour"
          : "Note";
  const heading =
    x.kind === "color"
      ? x.colorName || (x.color ?? "").toUpperCase()
      : x.kind === "note"
        ? "Note"
        : x.title || src;
  const onNote = (v: string) => {
    setNote(v);
    setSaved(false);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flush(v), 400);
  };
  const added = x.createdAt
    ? formatInTimeZone(x.createdAt, tz, "d MMMM yyyy")
    : "";
  return (
    <Sheet
      open={!!item}
      onClose={close}
      title="Reference"
      scrimClassName="nx-scrim pl-detail-box"
      className="mb-side pl-detail-abs"
      exitMs={200}
    >
      <div className="pl-detail-row">
        <span className="pl-detail-el">{heading}</span>
        <button
          type="button"
          aria-label="Close"
          className="nx-btn nx-btn-text nx-btn-sm pl-pinterest-section-btn"
          onClick={close}
        >
          <LuX size={14} aria-hidden />
        </button>
      </div>
      <div className="pl-detail-col">
        <Visual it={x} big />
        <div className="pl-detail-row-2">
          {x.kind === "link" ? (
            <FavBadge it={x} size={22} />
          ) : (
            <span className="pl-detail-grid">
              {x.kind === "image" ? (
                <LuUpload size={12} aria-hidden />
              ) : x.kind === "color" ? (
                <LuPalette size={12} aria-hidden />
              ) : (
                <LuPenLine size={12} aria-hidden />
              )}
            </span>
          )}
          <span className="pl-share-sheet-col">
            <span className="pl-strong">{src}</span>
            {sourceUrlOf(x) ? (
              <span className="pl-detail-text">
                {isFigma(x)
                  ? "Opens in Figma · link only"
                  : (x.source?.domain ?? "")}
              </span>
            ) : x.kind === "color" ? (
              <span className="pl-meta">{(x.color ?? "").toUpperCase()}</span>
            ) : null}
          </span>
          {sourceUrlOf(x) ? (
            <button
              type="button"
              className="nx-btn nx-btn-secondary nx-btn-sm mb-open-source"
              onClick={() => openUrl(sourceUrlOf(x) as string)}
            >
              {isFigma(x) ? "Open in Figma" : "Open source"}
              <LuArrowUpRight size={13} aria-hidden />
            </button>
          ) : null}
          {x.kind === "color" && x.color ? (
            <button
              type="button"
              className="nx-btn nx-btn-secondary nx-btn-sm"
              onClick={() =>
                void copyText(
                  (x.color as string).toUpperCase(),
                  `Copied ${(x.color as string).toUpperCase()}`
                )
              }
            >
              <LuCopy size={13} aria-hidden />
              Copy hex
            </button>
          ) : null}
        </div>
        <label className="pl-stack-6">
          <span className="pl-detail-row-3 pl-label">
            <span>{x.kind === "note" ? "Text" : "Note"}</span>
            <span
              role="status"
              className={"mb-saved pl-detail-el-2" + (saved ? " is-saved" : "")}
            >
              Saved
            </span>
          </span>
          <textarea
            name="mb-detail-note"
            value={note}
            readOnly={readOnly}
            rows={4}
            autoComplete="off"
            placeholder={readOnly ? "No note" : "Add a note"}
            onChange={(e) => onNote(e.target.value)}
            onBlur={() => {
              if (timer.current && !saved) flush(note);
            }}
            className="pl-field is-area"
          />
        </label>
        {added ? <span className="pl-meta">Added {added}</span> : null}
        {x.fromCanvas ? null : (
          <ItemComments
            boardId={boardId}
            itemId={x.id}
            canWrite={!readOnly}
            canModerate={canModerate}
            tz={tz}
          />
        )}
      </div>
      {!readOnly ? (
        <div className="pl-detail-row-4">
          <button
            type="button"
            className="nx-btn nx-btn-danger nx-btn-sm mb-detail-remove"
            onClick={() => {
              if (timer.current) window.clearTimeout(timer.current);
              timer.current = null;
              onRemove(x);
            }}
          >
            <LuTrash2 size={13} aria-hidden />
            Remove
          </button>
          {sourceUrlOf(x) ? (
            <button
              type="button"
              className="nx-btn nx-btn-text nx-btn-sm"
              onClick={() => void copyText(sourceUrlOf(x) as string)}
            >
              <LuLink size={13} aria-hidden />
              Copy link
            </button>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
