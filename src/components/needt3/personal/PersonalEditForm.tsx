"use client";

import { type ReactNode, useState } from "react";

import {
  type ApiPersonalBlock,
  useUpdatePersonal,
} from "@/lib/needt3/hooks/personal";
import { DAY_ORDER, dayName } from "@/lib/needt3/hooks/personal-defaults";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import {
  draftOf,
  draftProblem,
  hasCustomRepeat,
  patchFor,
} from "@/lib/personal-time-edit";

export interface PersonalEditActions {
  save: () => void;
  cancel: () => void;
  saving: boolean;
  /** Why it cannot be saved yet, or null. */
  problem: string | null;
}

/**
 * Change a personal block: its name, when it starts and ends, and which days it
 * repeats. One form for the desktop's peek and the phone's sheet; each draws
 * its own Save and Cancel through `actions`. The change is a PATCH of only
 * what moved, so an untouched form saves nothing. A repeating block changes as
 * a whole (every repeat), and a block marked on a calendar event keeps the
 * event's time, so only its name is offered.
 */
export function PersonalEditForm({
  block,
  onDone,
  actions,
}: {
  block: ApiPersonalBlock;
  /** After a save (true) or on Cancel (false). */
  onDone: (saved: boolean) => void;
  actions: (state: PersonalEditActions) => ReactNode;
}) {
  const tz = useTimeZone();
  const update = useUpdatePersonal();
  const [draft, setDraft] = useState(() => draftOf(block, tz));
  const [saving, setSaving] = useState(false);
  const linked = Boolean(block.sourceEventId);
  const custom = hasCustomRepeat(block);
  const problem = draftProblem(draft);
  const patch = (next: Partial<typeof draft>) =>
    setDraft((cur) => ({ ...cur, ...next }));

  const save = () => {
    if (problem || saving) return;
    setSaving(true);
    void update(block, patchFor(block, draft, tz)).then((saved) => {
      setSaving(false);
      if (saved) onDone(true);
    });
  };

  return (
    <form
      className="pb-edit"
      data-pb-edit={block.id}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="pb-edit-row">
        <span className="pb-edit-label">Name</span>
        <input
          className="pb-edit-input"
          data-pb-field="title"
          aria-label="Name"
          value={draft.title}
          maxLength={120}
          autoFocus
          onChange={(e) => patch({ title: e.target.value })}
          onKeyDown={(e) => {
            // the phone's Save lives in the sheet's footer, outside this form
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
        />
      </label>
      {linked ? (
        <p className="pb-edit-note">
          The time follows the calendar event it is marked on.
        </p>
      ) : (
        <>
          <label className="pb-edit-row">
            <span className="pb-edit-label">Starts</span>
            <input
              className="pb-edit-input"
              type="time"
              data-pb-field="start"
              aria-label="Starts"
              value={draft.startAt}
              onChange={(e) => patch({ startAt: e.target.value })}
            />
          </label>
          <label className="pb-edit-row">
            <span className="pb-edit-label">Ends</span>
            <input
              className="pb-edit-input"
              type="time"
              data-pb-field="end"
              aria-label="Ends"
              value={draft.endAt}
              onChange={(e) => patch({ endAt: e.target.value })}
            />
          </label>
          <div className="pb-edit-row" role="group" aria-label="Repeats on">
            <span className="pb-edit-label">Repeat</span>
            {custom ? (
              <span className="pb-edit-note">Custom repeat, kept as is</span>
            ) : (
              <span className="pb-default-days">
                {DAY_ORDER.map((day) => {
                  const on = draft.days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      className="pb-default-day"
                      data-pb-day={day}
                      aria-pressed={on}
                      aria-label={dayName(day)}
                      title={dayName(day)}
                      onClick={() =>
                        patch({
                          days: on
                            ? draft.days.filter((d) => d !== day)
                            : [...draft.days, day],
                        })
                      }
                    >
                      {dayName(day).slice(0, 1)}
                    </button>
                  );
                })}
              </span>
            )}
          </div>
          {block.rrule || draft.days.length ? (
            <p className="pb-edit-note">
              {draft.days.length || custom
                ? "A change applies to every repeat."
                : "It will be just this once."}
            </p>
          ) : null}
        </>
      )}
      {problem ? (
        <p className="pb-edit-note" role="status">
          {problem}
        </p>
      ) : null}
      {actions({ save, cancel: () => onDone(false), saving, problem })}
    </form>
  );
}
