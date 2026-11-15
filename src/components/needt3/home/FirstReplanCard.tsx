"use client";

import { addCalendarDays, formatInTimeZone, newDate } from "@/lib/date-utils";
import {
  useFirstReplan,
  useFirstReplanDemo,
  useReportCardShown,
} from "@/lib/needt3/hooks/first-replan";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import { plainDemoTitle } from "@/lib/onboarding/first-replan";

/**
 * Today's first replan, for a new account (`first_replan_onboarding`): a demo
 * meeting sits on a demo task, Needt shows where the task would go, and the
 * person presses Keep. One card, one hint: the sample-day note and the
 * suggested highlight wait until this card is answered. The preview names the
 * task, says "before to after" with the day on both times, and gives the
 * reason. Every step can be left: Skip removes the demo, Not now just closes
 * the preview. Draws nothing when there is no demo (flag off, removed, or
 * never created). Desktop and phone share it; the row wraps under the words.
 */
export function FirstReplanCard() {
  const demo = useFirstReplanDemo();
  const tz = useTimeZone();
  const flow = useFirstReplan(demo.data);
  const data = demo.data;
  useReportCardShown(Boolean(data?.conflict));
  if (!data) return null;

  // "Today 10:30", "Tomorrow 10:00", "Mon 10:00": the day is always said, so a
  // move never reads as a change of hour alone.
  const now = newDate();
  const today = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const tomorrow = formatInTimeZone(
    addCalendarDays(now, 1, tz),
    tz,
    "yyyy-MM-dd"
  );
  const t = (iso: string) => {
    const d = newDate(iso);
    const day = formatInTimeZone(d, tz, "yyyy-MM-dd");
    const label =
      day === today
        ? "Today"
        : day === tomorrow
          ? "Tomorrow"
          : formatInTimeZone(d, tz, "EEE");
    return `${label} ${formatInTimeZone(d, tz, "HH:mm")}`;
  };
  const clock = (iso: string) => formatInTimeZone(newDate(iso), tz, "HH:mm");
  const taskName = data.task.title;
  const meetingName = plainDemoTitle(data.meeting.title);
  const { step } = flow;
  const busy = step.kind === "previewing" || step.kind === "applying";

  let title: string;
  let sub: string;
  let shift: { from: string; to: string } | null = null;
  let actions: React.ReactNode;

  if (step.kind === "kept" || (!data.conflict && step.kind === "idle")) {
    title = `Replanned. ${taskName} now starts ${t(data.task.start)}.`;
    sub = "That is the whole loop: a change lands, Needt moves the rest.";
    actions = (
      <>
        {step.kind === "kept" ? (
          <button
            type="button"
            className="nx-btn nx-btn-secondary nx-btn-sm"
            data-fr="undo"
            onClick={() => void flow.undo(step.undoToken)}
          >
            Undo
          </button>
        ) : null}
        <button
          type="button"
          className="nx-btn nx-btn-secondary nx-btn-sm"
          data-fr="remove"
          onClick={() => void flow.remove()}
        >
          Remove the demo
        </button>
      </>
    );
  } else if (step.kind === "preview" || step.kind === "applying") {
    const to = step.kind === "preview" ? step.to : null;
    title = to ? taskName : "Nothing needs to move";
    shift = to ? { from: t(data.task.start), to: t(to.start) } : null;
    sub = to
      ? `Overlaps with ${meetingName}, ${clock(data.meeting.start)} to ${clock(data.meeting.end)}. Nothing changes until you press Keep.`
      : "The meeting and the task no longer overlap.";
    actions = (
      <>
        <button
          type="button"
          className="nx-btn nx-btn-primary nx-btn-sm"
          data-fr="keep"
          disabled={busy || !to}
          onClick={() => step.kind === "preview" && void flow.keep(step.token)}
        >
          {step.kind === "applying" ? "Keeping…" : "Keep"}
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-secondary nx-btn-sm"
          data-fr="not-now"
          disabled={busy}
          onClick={flow.notNow}
        >
          Not now
        </button>
      </>
    );
  } else {
    title = "A demo meeting landed on your task";
    sub = `${meetingName}, ${t(data.meeting.start)}, overlaps ${taskName}, ${t(data.task.start)}. Let Needt replan the day.`;
    actions = (
      <>
        <button
          type="button"
          className="nx-btn nx-btn-primary nx-btn-sm"
          data-fr="replan"
          disabled={busy}
          onClick={() => void flow.replan()}
        >
          {step.kind === "previewing" ? "Planning…" : "Replan my day"}
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-secondary nx-btn-sm"
          data-fr="skip"
          disabled={busy}
          onClick={() => void flow.remove("skip")}
        >
          Skip
        </button>
      </>
    );
  }

  return (
    <section
      className="hd-sample hd-first-replan"
      aria-label="First replan"
      data-hd-first-replan=""
      data-step={step.kind}
    >
      <span className="hd-sample-text">
        <span className="hd-first-replan-tag">Demo, not on any calendar</span>
        <span className="hd-sample-title">{title}</span>
        {shift ? (
          <span className="hd-fr-shift" data-fr-shift="">
            <span className="hd-fr-from">{shift.from}</span>
            <span className="hd-fr-arrow" role="img" aria-label="to">
              {"→"}
            </span>
            <span className="hd-fr-to">{shift.to}</span>
          </span>
        ) : null}
        <span className="hd-sample-sub">{sub}</span>
      </span>
      <span className="hd-first-replan-actions">{actions}</span>
    </section>
  );
}
