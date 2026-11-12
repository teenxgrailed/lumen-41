"use client";

import { useRef } from "react";

import { newDate } from "@/lib/date-utils";
import type {
  PreviewState,
  SchedulePreview,
} from "@/lib/needt3/hooks/schedule-insight";
import {
  UNSCHEDULED_REASON_MESSAGES,
  type UnscheduledReason,
} from "@/lib/scheduling-reasons";

import { BoardDialog, DialogFoot, DialogHead } from "../places/board/parts";

function formatters(timeZone?: string) {
  const at = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  // Day labels are "YYYY-MM-DD" in the person's zone: read them at noon UTC
  // and print them in UTC so no zone shifts the day.
  const day = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const dueDay = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    timeZone,
  });
  return {
    slot: (iso: string | null) => (iso ? at.format(newDate(iso)) : "no time"),
    day: (ymd: string) => day.format(newDate(`${ymd}T12:00:00.000Z`)),
    due: (iso: string) => dueDay.format(newDate(iso)),
  };
}

function hours(minutes: number) {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h}h`;
}

function reasonText(reason: string) {
  return (
    UNSCHEDULED_REASON_MESSAGES[reason as UnscheduledReason] ??
    "No time could be found."
  );
}

/** Pure: the words of the preview (exported for tests). */
export function previewSummary(preview: SchedulePreview) {
  const moved = preview.changes.length;
  const slips = (preview.atRisk?.length ?? 0) + preview.unscheduled.length;
  const title = moved ? "Apply the new plan?" : "The plan is current";
  const sub = moved
    ? `${moved} ${moved === 1 ? "task moves" : "tasks move"}${
        slips ? `, ${slips} still without room` : ""
      }. Nothing changes until you apply, and Undo puts it back.`
    : slips
      ? "Nothing would move, but some tasks have no room."
      : "Planning again would not move anything.";
  const load = (preview.load ?? []).filter(
    (d) => d.beforeMinutes !== d.afterMinutes
  );
  return { title, sub, load, slips };
}

/**
 * The what-if before a replan: what moves, what would slip, and how each
 * day's load changes. Apply writes exactly this (or refuses if the schedule
 * moved since); Cancel leaves everything as it is.
 */
export function SchedulePreviewSheet({
  state,
  onApply,
  onClose,
}: {
  state: PreviewState;
  onApply: () => void;
  onClose: () => void;
}) {
  const open = state.phase !== "idle";
  // The words stay drawn while the sheet slides away.
  const last = useRef<SchedulePreview | null>(null);
  if (state.phase === "ready" || state.phase === "applying")
    last.current = state.preview;
  const preview =
    state.phase === "ready" || state.phase === "applying"
      ? state.preview
      : state.phase === "idle"
        ? last.current
        : null;
  const words = preview ? previewSummary(preview) : null;
  const f = formatters(preview?.timeZone);
  return (
    <BoardDialog open={open} onClose={onClose} label="Plan preview" width={480}>
      {state.phase === "loading" ? (
        <DialogHead title="Working out the plan…" sub="Nothing moves yet." />
      ) : state.phase === "error" ? (
        <DialogHead title="No preview" sub={state.message} />
      ) : preview && words ? (
        <>
          <DialogHead title={words.title} sub={words.sub} />
          {preview.changes.length ? (
            <ul className="sp-list" data-sp-changes="">
              {preview.changes.map((c) => (
                <li key={c.taskId} className="sp-row">
                  <span className="sp-name">{c.title}</span>
                  <span className="sp-move hd-num">
                    {f.slot(c.fromStart)} → {f.slot(c.toStart)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {words.slips ? (
            <section className="sp-group" data-sp-slips="">
              <span className="sp-head">No room</span>
              <ul className="sp-list">
                {(preview.atRisk ?? []).map((r) => (
                  <li key={`r-${r.taskId}`} className="sp-row is-risk">
                    <span className="sp-name">{r.title}</span>
                    <span className="sp-move">
                      after its due date, {f.due(r.deadline)}
                    </span>
                  </li>
                ))}
                {preview.unscheduled.map((u) => (
                  <li key={`u-${u.taskId}`} className="sp-row">
                    <span className="sp-name">{u.title}</span>
                    <span className="sp-move">{reasonText(u.reason)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {words.load.length ? (
            <section className="sp-group" data-sp-load="">
              <span className="sp-head">Task time by day</span>
              <ul className="sp-list">
                {words.load.map((d) => (
                  <li key={d.date} className="sp-row">
                    <span className="sp-name">{f.day(d.date)}</span>
                    <span className="sp-move hd-num">
                      {hours(d.beforeMinutes)} → {hours(d.afterMinutes)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
      <DialogFoot>
        <button type="button" className="nx-btn nx-btn-text" onClick={onClose}>
          {preview?.changes.length ? "Cancel" : "Close"}
        </button>
        {preview?.changes.length ? (
          <button
            type="button"
            className="nx-btn nx-btn-primary"
            data-sp-apply=""
            disabled={state.phase !== "ready"}
            onClick={onApply}
          >
            {state.phase === "applying" ? "Applying…" : "Apply"}
          </button>
        ) : null}
      </DialogFoot>
    </BoardDialog>
  );
}
