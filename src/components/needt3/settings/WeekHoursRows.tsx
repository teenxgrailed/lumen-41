"use client";

import { FiPlus, FiX } from "react-icons/fi";

import {
  MAX_RANGES_PER_DAY,
  WEEK_ORDER,
  type WeekHours,
  addRange,
  copyToWeekdays,
  removeRange,
  setDayOn,
  setRange,
  timeChoices,
  weekFromLegacy,
} from "@/lib/work-week";

import { SBtn, SRow, SSelect, V3Switch } from "./kit";

const NAMES: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

const pairs = (list: string[]) => list.map((t) => [t, t] as const);

/**
 * Mon to Sun, one form row each: a switch for the day, then one or two time
 * ranges (a second range is a lunch break). Short day names keep the label
 * inside the row; the control column is never widened.
 */
export function WeekHoursRows({
  week: loaded,
  disabled,
  onChange,
}: {
  week: WeekHours;
  disabled?: boolean;
  onChange: (next: WeekHours) => void;
}) {
  // Before the schedule loads the days show as off and cannot be edited.
  const week = loaded.length ? loaded : weekFromLegacy([], 9, 17);
  const firstOn = WEEK_ORDER.find((d) => week.find((e) => e.day === d)?.on);
  return (
    <>
      {WEEK_ORDER.map((day) => {
        const entry = week.find((e) => e.day === day);
        if (!entry) return null;
        return (
          <SRow key={day} title={NAMES[day]}>
            {entry.on
              ? entry.ranges.map((range, i) => (
                  <span
                    key={i}
                    className="base-row"
                    style={{ gap: 4, alignItems: "center" }}
                  >
                    <SSelect
                      label={`${NAMES[day]} starts`}
                      width={78}
                      value={range.start}
                      options={pairs(timeChoices(week, day, i, "start"))}
                      disabled={disabled}
                      onChange={(v) =>
                        onChange(setRange(week, day, i, { start: v }))
                      }
                    />
                    <SSelect
                      label={`${NAMES[day]} ends`}
                      width={78}
                      value={range.end}
                      options={pairs(timeChoices(week, day, i, "end"))}
                      disabled={disabled}
                      onChange={(v) =>
                        onChange(setRange(week, day, i, { end: v }))
                      }
                    />
                    {i > 0 ? (
                      <button
                        type="button"
                        className="nx-btn nx-btn-secondary"
                        aria-label={`Remove ${NAMES[day]} second range`}
                        disabled={disabled}
                        onClick={() => onChange(removeRange(week, day, i))}
                      >
                        <FiX size={14} aria-hidden />
                      </button>
                    ) : null}
                  </span>
                ))
              : null}
            {entry.on && entry.ranges.length < MAX_RANGES_PER_DAY ? (
              <button
                type="button"
                className="nx-btn nx-btn-secondary"
                aria-label={`Add a break on ${NAMES[day]}`}
                disabled={disabled}
                onClick={() => onChange(addRange(week, day))}
              >
                <FiPlus size={14} aria-hidden />
              </button>
            ) : null}
            <V3Switch
              label={`${NAMES[day]} is a working day`}
              checked={entry.on}
              disabled={disabled}
              onChange={(on) => onChange(setDayOn(week, day, on))}
            />
          </SRow>
        );
      })}
      <SRow
        title="Copy to weekdays"
        desc="Mon to Fri get the first day's hours."
      >
        <SBtn
          disabled={disabled || firstOn === undefined}
          onClick={() =>
            firstOn !== undefined && onChange(copyToWeekdays(week, firstOn))
          }
        >
          Copy {firstOn !== undefined ? NAMES[firstOn] : ""}
        </SBtn>
      </SRow>
    </>
  );
}
