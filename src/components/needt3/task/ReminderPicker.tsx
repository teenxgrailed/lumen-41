"use client";

/* WHEN TO REMIND — one picker for the task card, the event peek, the
 * composer's "⋯" and the bell's Edit. Presets count back from the start;
 * "At a time…" takes an absolute one. It only reports the choice: the
 * caller decides whether that creates, changes or (in the composer) waits
 * for the task to exist.
 */
import { useState } from "react";

import { LuAlarmClock, LuCheck, LuX } from "react-icons/lu";

import { format, newDate } from "@/lib/date-utils";
import {
  REMINDER_PRESETS,
  type ReminderSpec,
  type V3Reminder,
} from "@/lib/needt3/hooks/reminders";

export function specLabel(spec: ReminderSpec): string {
  if ("at" in spec) return format(newDate(spec.at), "EEE d MMM, HH:mm");
  return (
    REMINDER_PRESETS.find(
      (p) =>
        !("at" in p.spec) &&
        p.spec.offsetMinutes === spec.offsetMinutes &&
        (p.spec.atTime ?? null) === (spec.atTime ?? null)
    )?.label ?? `${spec.offsetMinutes} min before`
  );
}

function samePreset(r: V3Reminder, spec: ReminderSpec) {
  if ("at" in spec) return false;
  return (
    r.kind === "BEFORE_START" &&
    r.offsetMinutes === spec.offsetMinutes &&
    (r.atTime ?? null) === (spec.atTime ?? null)
  );
}

export function ReminderPicker({
  current = [],
  relative = true,
  onPick,
  onRemove,
}: {
  /** Reminders the thing already has: ticked, and removable. */
  current?: V3Reminder[];
  /** False for a reminder on its own: only "At a time…". */
  relative?: boolean;
  onPick: (spec: ReminderSpec) => void;
  onRemove?: (id: string) => void;
}) {
  const [custom, setCustom] = useState("");
  const others = current.filter(
    (r) => !REMINDER_PRESETS.some((p) => samePreset(r, p.spec))
  );
  return (
    <div className="tdc-list rmd-picker" role="menu" aria-label="Remind me">
      {relative
        ? REMINDER_PRESETS.map((p) => {
            const on = current.find((r) => samePreset(r, p.spec));
            return (
              <button
                key={p.label}
                type="button"
                role="menuitemcheckbox"
                aria-checked={!!on}
                className={`tdc-opt${on ? " is-on" : ""}`}
                onClick={() =>
                  on && onRemove ? onRemove(on.id) : onPick(p.spec)
                }
              >
                <span className="tdc-flag">
                  <LuAlarmClock size={14} aria-hidden />
                </span>
                <span className="tdc-opt-text">{p.label}</span>
                {on ? <LuCheck size={14} aria-hidden /> : null}
              </button>
            );
          })
        : null}
      {others.map((r) => (
        <div key={r.id} className="tdc-opt is-on rmd-other">
          <span className="tdc-flag">
            <LuAlarmClock size={14} aria-hidden />
          </span>
          <span className="tdc-opt-text">{r.label}</span>
          {onRemove ? (
            <button
              type="button"
              className="rmd-remove"
              aria-label={`Remove reminder ${r.label}`}
              onClick={() => onRemove(r.id)}
            >
              <LuX size={13} aria-hidden />
            </button>
          ) : null}
        </div>
      ))}
      <label className="rmd-custom">
        <span className="rmd-custom-text">At a time…</span>
        <input
          type="datetime-local"
          className="rmd-custom-input"
          aria-label="Remind at a time"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
        />
        <button
          type="button"
          className="nx-btn nx-btn-ghost rmd-custom-set"
          disabled={!custom}
          onClick={() => {
            const at = newDate(custom);
            if (Number.isNaN(at.getTime())) return;
            onPick({ at: at.toISOString() });
            setCustom("");
          }}
        >
          Set
        </button>
      </label>
    </div>
  );
}
