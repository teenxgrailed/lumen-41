"use client";

import { formatInTimeZone } from "@/lib/date-utils";
import {
  useFirstReplan,
  useFirstReplanDemo,
} from "@/lib/needt3/hooks/first-replan";
import { useTimeZone } from "@/lib/needt3/hooks/settings";

/**
 * Today's first replan, for a new account (`first_replan_onboarding`): a demo
 * meeting sits on a demo task, Needt shows where the task would go, and the
 * person presses Keep. One card, one line of words, one or two buttons per
 * step. Every step can be left: Skip removes the demo, Not now just closes the
 * preview. Draws nothing when there is no demo (flag off, removed, or never
 * created). Desktop and phone share it; the row wraps under the words.
 */
export function FirstReplanCard() {
  const demo = useFirstReplanDemo();
  const tz = useTimeZone();
  const flow = useFirstReplan(demo.data);
  const data = demo.data;
  if (!data) return null;

  const t = (iso: string) => formatInTimeZone(new Date(iso), tz, "HH:mm");
  const { step } = flow;
  const busy = step.kind === "previewing" || step.kind === "applying";

  let title: string;
  let sub: string;
  let actions: React.ReactNode;

  if (step.kind === "kept" || (!data.conflict && step.kind === "idle")) {
    title = `Replanned. The task now starts at ${t(data.task.start)}.`;
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
    title = to ? `Move the task to ${t(to.start)}` : "Nothing needs to move";
    sub = to
      ? `Now ${t(data.task.start)}. The meeting stays at ${t(data.meeting.start)}. Nothing changes until you press Keep.`
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
    title = `${t(data.meeting.start)}: a demo meeting landed on your task`;
    sub = `Demo: sync with Alex overlaps the task at ${t(data.task.start)}. Let Needt replan the day.`;
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
          onClick={() => void flow.remove()}
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
        <span className="hd-sample-sub">{sub}</span>
      </span>
      <span className="hd-first-replan-actions">{actions}</span>
    </section>
  );
}
