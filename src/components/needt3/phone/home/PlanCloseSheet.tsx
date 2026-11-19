"use client";

import { type RefObject, useEffect, useRef } from "react";

import { useKeyboardLift } from "@/components/pages/use-keyboard-lift";

import type {
  CloseChoice,
  PlanItemView,
  TomorrowPreview,
} from "@/lib/needt3/day-plan";

import { HaSheet } from "../../home/ha/HaSheet";
import { TaskGlyph } from "./TaskGlyph";

const CHOICES: readonly { key: CloseChoice; label: string }[] = [
  { key: "tomorrow", label: "Tomorrow" },
  { key: "someday", label: "Later" },
  { key: "delete", label: "Delete" },
];

/**
 * The note field must stay above the on-screen keyboard. A fixed sheet does
 * not move when the keyboard opens, so the content gets the keyboard's height
 * as room below it (the sheet scrolls), and the field scrolls into view when
 * it takes focus or the keyboard finishes opening.
 */
function useAboveKeyboard(open: boolean, field: RefObject<HTMLElement | null>) {
  const lift = useKeyboardLift(open);
  useEffect(() => {
    const el = field.current;
    if (!open || !el || document.activeElement !== el) return;
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    el.scrollIntoView({
      block: "center",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [open, lift, field]);
  return lift;
}

/**
 * The evening close on the phone: each leftover goes to Tomorrow, Later
 * (Someday) or Delete, a note says what is on tomorrow, a small preview shows
 * tomorrow's plan as it builds, and one button closes the day. The server does
 * the moving. Same type and row geometry as the Someday sheet.
 */
export function PlanCloseSheet({
  open,
  title,
  leftovers,
  choices,
  preview,
  note,
  busy,
  overflow,
  onChoose,
  onNote,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  leftovers: readonly PlanItemView[];
  choices: Readonly<Record<string, CloseChoice>>;
  preview: TomorrowPreview;
  note: string;
  busy: boolean;
  /** The last try went past tomorrow's limit and waits for a yes. */
  overflow: boolean;
  onChoose: (taskId: string, choice: CloseChoice) => void;
  onNote: (text: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const lift = useAboveKeyboard(open, field);
  return (
    <HaSheet phone open={open} label="Close the day" onClose={onClose}>
      <div
        className="ha-sheet dp-sheet"
        role="dialog"
        aria-label="Close the day"
        data-day-close=""
        style={lift ? { paddingBottom: lift } : undefined}
      >
        <div className="ha-grab" />
        <div className="dp-sh">
          <h3>{title}</h3>
          <span className="dp-sh-meta">
            {leftovers.length ? `${leftovers.length} still open` : "All done"}
          </span>
        </div>
        {leftovers.length ? (
          <>
            <p className="dp-lab">
              Still open <span>{leftovers.length}</span>
            </p>
            {leftovers.map((l, i) => (
              <div
                key={l.taskId}
                className="dp-row dp-left dp-rise"
                style={{ "--i": Math.min(i, 6) } as React.CSSProperties}
                data-ha-left={l.taskId}
              >
                <div className="dp-row-t">
                  <TaskGlyph title={l.title} size={16} />
                  <b>{l.title}</b>
                </div>
                <div
                  className="dp-seg"
                  role="group"
                  aria-label={`Where ${l.title} goes`}
                >
                  {CHOICES.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      data-ha-to={c.key}
                      aria-pressed={(choices[l.taskId] ?? "tomorrow") === c.key}
                      onClick={() => onChoose(l.taskId, c.key)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : null}
        <p className="dp-lab">What&apos;s on tomorrow?</p>
        <textarea
          ref={field}
          className="ha-note dp-note"
          placeholder="What's on tomorrow?"
          aria-label="What is on tomorrow"
          value={note}
          onChange={(e) => onNote(e.target.value)}
          onFocus={(e) => {
            // the keyboard is still opening: wait for it, then bring the field up
            const el = e.currentTarget;
            window.setTimeout(() => {
              if (document.activeElement === el)
                el.scrollIntoView({ block: "center", behavior: "smooth" });
            }, 320);
          }}
        />
        <p className="dp-lab" data-day-preview="">
          Tomorrow <span>{`${preview.count} of ${preview.limit}`}</span>
        </p>
        {preview.titles.length ? (
          <div className="dp-prev">
            {preview.titles.slice(0, 5).map((t, i) => (
              <div
                key={`${i}-${t}`}
                className="dp-prev-row dp-rise"
                style={{ "--i": Math.min(i, 6) } as React.CSSProperties}
              >
                <TaskGlyph title={t} size={14} />
                <span>{t}</span>
              </div>
            ))}
            {preview.titles.length > 5 ? (
              <span className="dp-more">{`+ ${preview.titles.length - 5} more`}</span>
            ) : null}
          </div>
        ) : (
          <p className="dp-quiet">Nothing yet</p>
        )}
        {overflow ? (
          <p className="dp-alert" role="alert" data-day-overflow="">
            {`Tomorrow would go past ${preview.limit} tasks. Close anyway, or move some to Later.`}
          </p>
        ) : null}
        <div className="dp-foot">
          <button
            type="button"
            className="dp-primary"
            data-ha="close-day"
            disabled={busy}
            onClick={onSubmit}
          >
            <i className="dp-dot" aria-hidden="true" />
            {overflow ? "Close anyway" : "Close the day"}
          </button>
        </div>
      </div>
    </HaSheet>
  );
}
