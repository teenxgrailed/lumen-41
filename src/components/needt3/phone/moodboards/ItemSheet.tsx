"use client";

import { useRef } from "react";

import { LuArrowUpRight, LuTrash2 } from "react-icons/lu";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import { PkButton, PkSheet } from "../kit";
import { TileFace } from "./Wall";
import { KIND_LABEL, type PhoneBoardItem, madeLine } from "./model";

const t = strings["phone-habits.jsx"];

/**
 * A reference, opened (PhbItemSheet): look at it, open its source, remove
 * it. Read-only otherwise: editing the caption or note, Move and the
 * hold-to-lift reorder are //todo (the items PATCH route exists; the forms
 * are not ported).
 */
export function ItemSheet({
  item,
  board,
  tz,
  saving,
  canRemove,
  onClose,
  onRemove,
}: {
  item: PhoneBoardItem | null;
  board: string;
  tz: string;
  saving: boolean;
  /** EDITOR and above; a viewer sees the reference and its source only. */
  canRemove: boolean;
  onClose: () => void;
  onRemove: (item: PhoneBoardItem) => void;
}) {
  const last = useRef<PhoneBoardItem | null>(null);
  if (item) last.current = item;
  const it = item ?? last.current;
  const label = it ? KIND_LABEL[it.kind] : t.PhbItemSheet.reference;
  const src = it?.source;
  return (
    <PkSheet
      open={!!item}
      onClose={onClose}
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
          {canRemove ? (
            <PkButton
              icon={<LuTrash2 size={18} aria-hidden />}
              className="phb-danger"
              aria-label={t.PhbItemSheet.remove_from_board}
              disabled={!it || saving}
              onClick={() => it && onRemove(it)}
              data-phb-item-remove
            />
          ) : null}
          <PkButton kind="primary" onClick={onClose} data-phb-item-done>
            {t.PhbItemSheet.done}
          </PkButton>
        </>
      }
    >
      {it ? (
        <div className="phb-item" data-phb-detail={it.id}>
          {it.kind !== "note" ? (
            <div className="phb-item-media">
              <TileFace it={it} big />
            </div>
          ) : (
            <p className="phb-item-note">{it.text}</p>
          )}
          {it.kind !== "note" && it.title ? (
            <p className="phb-item-title">{it.title}</p>
          ) : null}
          {src?.domain ? (
            <div className="phb-source pk-glass">
              <span className="phb-kind-text">
                <span className="phb-kind-label">{src.name}</span>
                <span className="phb-kind-hint">{src.domain}</span>
              </span>
              {it.url && /^https?:/.test(it.url) ? (
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
          {it.kind !== "note" && it.text ? (
            <p className="phb-item-note">{it.text}</p>
          ) : null}
        </div>
      ) : null}
    </PkSheet>
  );
}
