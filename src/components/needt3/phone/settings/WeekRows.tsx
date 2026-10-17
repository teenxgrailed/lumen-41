"use client";

import { useState } from "react";

import {
  DAY_NAMES,
  MAX_RANGES_PER_DAY,
  WEEK_ORDER,
  type WeekHours,
  addRange,
  copyToWeekdays,
  describeDay,
  removeRange,
  setDayOn,
  setRange,
  timeChoices,
  weekFromLegacy,
} from "@/lib/work-week";

import { PsPick, PsRow, PsSwitch } from "./parts";

const pairs = (list: string[]) => list.map((t) => [t, t] as const);

/**
 * Mon to Sun on the phone. A closed row shows the day's hours ("Off" when the
 * day is off); tapping it opens the day: a working-day switch, a start and an
 * end per range, a second range for a break, and copy-to-weekdays. Every
 * change hands the whole new week to `onChange`, so no other day is touched.
 */
export function WeekRows({
  week: loaded,
  disabled,
  onChange,
}: {
  week: WeekHours;
  disabled?: boolean;
  onChange: (next: WeekHours) => void;
}) {
  const [openDay, setOpenDay] = useState<number | null>(null);
  // Before the schedule loads the days show as off and cannot be edited.
  const week = loaded.length ? loaded : weekFromLegacy([], 9, 17);
  return (
    <>
      {WEEK_ORDER.map((day) => {
        const entry = week.find((e) => e.day === day);
        if (!entry) return null;
        const name = DAY_NAMES[day];
        const isOpen = openDay === day;
        return (
          <div key={day} data-ps-day={day}>
            <PsRow
              title={name}
              value={describeDay(entry)}
              disabled={disabled}
              expanded={isOpen}
              onOpen={() => setOpenDay(isOpen ? null : day)}
              chevron={false}
            />
            {isOpen ? (
              <>
                <PsRow
                  title="Working day"
                  disabled={disabled}
                  control={
                    <PsSwitch
                      label={`${name} is a working day`}
                      on={entry.on}
                      disabled={disabled}
                      onChange={(on) => onChange(setDayOn(week, day, on))}
                    />
                  }
                />
                {entry.on
                  ? entry.ranges.map((range, i) => (
                      <div key={i}>
                        <PsPick
                          title={i === 0 ? "Starts" : "Then starts"}
                          value={range.start}
                          options={pairs(timeChoices(week, day, i, "start"))}
                          disabled={disabled}
                          onChange={(v) =>
                            onChange(setRange(week, day, i, { start: v }))
                          }
                          data={{ "data-ps-pick": `${day}-${i}-start` }}
                        />
                        <PsPick
                          title={i === 0 ? "Ends" : "Then ends"}
                          value={range.end}
                          options={pairs(timeChoices(week, day, i, "end"))}
                          disabled={disabled}
                          onChange={(v) =>
                            onChange(setRange(week, day, i, { end: v }))
                          }
                          data={{ "data-ps-pick": `${day}-${i}-end` }}
                        />
                        {i > 0 ? (
                          <PsRow
                            title="Remove the break"
                            tone="danger"
                            disabled={disabled}
                            onOpen={() => onChange(removeRange(week, day, i))}
                            chevron={false}
                            data={{ "data-ps-remove-range": `${day}` }}
                          />
                        ) : null}
                      </div>
                    ))
                  : null}
                {entry.on && entry.ranges.length < MAX_RANGES_PER_DAY ? (
                  <PsRow
                    title="Add a break"
                    desc="A second range, for example after lunch."
                    disabled={disabled}
                    onOpen={() => onChange(addRange(week, day))}
                    chevron={false}
                    data={{ "data-ps-add-range": `${day}` }}
                  />
                ) : null}
                <PsRow
                  title="Copy to weekdays"
                  desc={`Mon to Fri get ${name}'s hours.`}
                  disabled={disabled}
                  onOpen={() => onChange(copyToWeekdays(week, day))}
                  chevron={false}
                  data={{ "data-ps-copy": `${day}` }}
                />
              </>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
