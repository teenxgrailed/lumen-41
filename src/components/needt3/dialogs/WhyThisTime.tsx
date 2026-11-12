"use client";

import { useState } from "react";

import { useScheduleWhy } from "@/lib/needt3/hooks/schedule-insight";

/**
 * "Why this time?" inside a task's Scheduling section. Closed, it costs
 * nothing; opened, it asks the server, which runs the scheduler's own pass on
 * its own inputs (read-only) and names what put the task where it is. The
 * row that decided the time reads stronger than the rest.
 */
export function WhyThisTime({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);
  const why = useScheduleWhy(taskId, open);
  const facts = why.data?.facts ?? [];
  return (
    <div className="tdc-why" data-tdc-why="">
      <div className="tdc-srow">
        <span className="tdc-srow-label">Why this time</span>
        <button
          type="button"
          className="nx-btn nx-btn-text nx-btn-sm"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Explain"}
        </button>
      </div>
      {open ? (
        <div className="tdc-why-list" role="list" aria-live="polite">
          {why.isLoading ? (
            <span className="tdc-srow-hint">Asking the planner…</span>
          ) : why.isError ? (
            <span className="tdc-srow-hint">
              Could not explain this time right now.
            </span>
          ) : facts.length ? (
            facts.map((f) => (
              <div
                key={f.kind}
                role="listitem"
                className={`tdc-srow tdc-why-row${f.decisive ? " is-decisive" : ""}`}
                data-why-kind={f.kind}
              >
                <span className="tdc-srow-label">{f.label}</span>
                <span className="tdc-why-text">{f.text}</span>
              </div>
            ))
          ) : (
            <span className="tdc-srow-hint">
              The planner has not placed this task yet.
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
