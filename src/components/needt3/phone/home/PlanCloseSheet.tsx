"use client";

import type {
  CloseChoice,
  PlanItemView,
  TomorrowPreview,
} from "@/lib/needt3/day-plan";

import { HaSheet } from "../../home/ha/HaSheet";

const CHOICES: readonly { key: CloseChoice; label: string }[] = [
  { key: "tomorrow", label: "Tomorrow" },
  { key: "someday", label: "Later" },
  { key: "delete", label: "Delete" },
];

/**
 * The evening close on the phone: each leftover goes to Tomorrow, Later
 * (Someday) or Delete, a note says what is on tomorrow, a small preview shows
 * tomorrow's plan, and one button closes the day. The server does the moving.
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
  return (
    <HaSheet phone open={open} label="Close the day" onClose={onClose}>
      <div
        className="ha-sheet"
        role="dialog"
        aria-label="Close the day"
        data-day-close=""
      >
        <div className="ha-grab" />
        <div className="ha-sheet-h">
          <h3>{title}</h3>
        </div>
        {leftovers.length ? (
          <>
            <div className="ha-sec-l">
              Still open <span>{leftovers.length}</span>
            </div>
            {leftovers.map((l) => (
              <div key={l.taskId} className="ha-left" data-ha-left={l.taskId}>
                <div className="ha-left-t">
                  <b>{l.title}</b>
                </div>
                <div
                  className="ha-seg"
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
        <div className="ha-sec-l">What&apos;s on tomorrow?</div>
        <textarea
          className="ha-note"
          placeholder="What's on tomorrow?"
          aria-label="What is on tomorrow"
          value={note}
          onChange={(e) => onNote(e.target.value)}
        />
        <div className="ha-sec-l" data-day-preview="">
          Tomorrow <span>{`${preview.count} of ${preview.limit}`}</span>
        </div>
        {preview.titles.slice(0, 5).map((t, i) => (
          <div key={`${i}-${t}`} className="ha-doneline">
            {t}
          </div>
        ))}
        {preview.titles.length > 5 ? (
          <span className="ha-meta">{`+ ${preview.titles.length - 5} more`}</span>
        ) : null}
        {overflow ? (
          <p className="ha-meta" role="alert" data-day-overflow="">
            {`Tomorrow would go past ${preview.limit} tasks. Close anyway, or move some to Later.`}
          </p>
        ) : null}
        <div className="ha-sheet-foot">
          <button
            type="button"
            className="ha-btn is-primary is-lg"
            data-ha="close-day"
            disabled={busy}
            onClick={onSubmit}
          >
            {overflow ? "Close anyway" : "Close the day"}
          </button>
        </div>
      </div>
    </HaSheet>
  );
}
