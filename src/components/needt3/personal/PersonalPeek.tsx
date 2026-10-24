"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { createPortal } from "react-dom";

import {
  useDeletePersonal,
  usePersonalBlocks,
} from "@/lib/needt3/hooks/personal";
import { daysOfRule } from "@/lib/personal-time";
import { type DayBand, bandTimeLabel } from "@/lib/personal-time-days";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { PersonalEditForm } from "./PersonalEditForm";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Every weekday", "Mon, Wed, Fri", "Every day" for a plain repeat rule. */
export function repeatLabel(rule: string | null | undefined) {
  const days = daysOfRule(rule);
  if (!rule) return null;
  if (!days) return "Repeats";
  if (days.length === 7) return "Every day";
  if (days.join() === "1,2,3,4,5") return "Every weekday";
  return days.map((d) => WEEKDAY_NAMES[d]).join(", ");
}

export interface PeekAnchor {
  top: number;
  left: number;
  right: number;
}

/**
 * The small card beside a band: what it is, when, and how to change or take it
 * away. Edit swaps the card's body for the form in place (name, time, repeat).
 * Removing is undoable (the notice carries Undo), so it needs no second ask.
 */
export function PersonalPeek({
  band,
  anchor,
  onClose,
}: {
  band: DayBand;
  anchor: PeekAnchor;
  onClose: () => void;
}) {
  const container = useV3PortalContainer();
  const ref = useRef<HTMLDivElement>(null);
  const remove = useDeletePersonal();
  const block = usePersonalBlocks().data?.blocks.find(
    (b) => b.id === band.blockId
  );
  const [editing, setEditing] = useState(false);
  const [pos, setPos] = useState({ left: anchor.right + 8, top: anchor.top });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const right = anchor.right + 8 + w <= window.innerWidth - 8;
    setPos({
      left: right ? anchor.right + 8 : Math.max(8, anchor.left - 8 - w),
      top: Math.max(
        8,
        Math.min(anchor.top, window.innerHeight - el.offsetHeight - 8)
      ),
    });
  }, [anchor, editing]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("mousedown", away);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("mousedown", away);
    };
  }, [onClose]);
  if (!container) return null;
  const repeats = repeatLabel(block?.rrule);
  const meta = band.linked
    ? "Marked on a calendar event. The event itself is untouched"
    : repeats
      ? repeats
      : "Just this once";
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`${band.title}, personal time`}
      data-pb-peek={band.blockId}
      className={`nx-pop pb-peek${editing ? " is-editing" : ""}`}
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="pb-peek-head">
        <span aria-hidden="true">{band.emoji}</span>
        <span className="pb-peek-title">{band.title}</span>
      </div>
      {editing && block ? (
        <PersonalEditForm
          block={block}
          onDone={(saved) => (saved ? onClose() : setEditing(false))}
          actions={({ save, cancel, saving, problem }) => (
            <div className="pb-peek-foot">
              <button
                type="button"
                className="nx-btn nx-btn-text"
                onClick={cancel}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="nx-btn nx-btn-secondary"
                data-pb-save=""
                disabled={saving || !!problem}
                onClick={(e) => {
                  e.preventDefault();
                  save();
                }}
              >
                Save
              </button>
            </div>
          )}
        />
      ) : (
        <>
          <div className="pb-peek-meta">
            {bandTimeLabel(band)} · {meta}
            <br />
            Kept for you. No task is placed here, and it stays in Needt.
          </div>
          <div className="pb-peek-foot">
            <button
              type="button"
              className="nx-btn nx-btn-text"
              onClick={onClose}
            >
              Close
            </button>
            <button
              type="button"
              className="nx-btn nx-btn-text"
              data-pb-edit-open=""
              disabled={!block}
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
            <button
              type="button"
              className="nx-btn nx-btn-secondary"
              data-pb-remove=""
              onClick={() => {
                onClose();
                void remove({ id: band.blockId, title: band.title });
              }}
            >
              {repeats && !band.linked ? "Remove all" : "Remove"}
            </button>
          </div>
        </>
      )}
    </div>,
    container
  );
}
