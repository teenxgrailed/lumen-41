"use client";

import { useState } from "react";

import { FiChevronRight } from "react-icons/fi";

import { useSchedule, useUpdateSchedule } from "@/lib/needt3/hooks/account";
import { useSettings, useUpdateSettings } from "@/lib/needt3/hooks/settings";
import { type WeekHours, legacyColumns, weekIsValid } from "@/lib/work-week";

import { PersonalDefaults } from "./PersonalDefaults";
import { useMark } from "./SettingsContext";
import { WeekHoursRows } from "./WeekHoursRows";
import { minutes, planningSummary, plansWeekends } from "./derive";
import { SGroup, SRow, SSelect } from "./kit";

const WEEK: readonly (readonly [string, string])[] = [
  ["monday", "Monday"],
  ["sunday", "Sunday"],
];
const CLOCKS: readonly (readonly [string, string])[] = [
  ["24h", "24-hour"],
  ["12h", "12-hour"],
];
const VIEWS: readonly (readonly [string, string])[] = [
  ["week", "Week"],
  ["days", "Agenda"],
];

/** The browser's zones, with the saved one first if the list lacks it. */
export function zoneOptions(current: string) {
  let all: string[] = [];
  try {
    all =
      (
        Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
      ).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    all = [];
  }
  const list = all.includes(current) ? all : [current, ...all];
  return list.map((z) => [z, z.replace(/_/g, " ")] as const);
}

export function DaySection() {
  const mark = useMark();
  const settings = useSettings();
  const update = useUpdateSettings();
  const schedule = useSchedule();
  const setSchedule = useUpdateSchedule();
  const [open, setOpen] = useState(false);
  const s = settings.data;
  const sch = schedule.data;
  const weekends = plansWeekends(
    (sch?.weekHours ?? []).filter((e) => e.on).map((e) => e.day)
  );

  const save = (patch: Parameters<typeof update.mutateAsync>[0]) =>
    void update.mutateAsync(patch).then(mark);
  // Never write the schedule before it has loaded: workDays in particular
  // would be rebuilt from an empty list and drop every weekday.
  const saveSchedule = (
    patch: Parameters<typeof setSchedule.mutateAsync>[0]
  ) => {
    if (!sch) return;
    void setSchedule.mutateAsync(patch).then(mark);
  };
  const week = sch?.weekHours ?? [];
  const saveWeek = (next: WeekHours) => {
    if (!weekIsValid(next)) return;
    saveSchedule({ weekHours: next, ...legacyColumns(next) });
  };

  return (
    <>
      <SGroup
        title="Working hours"
        hint="Needt only plans work between these times."
      >
        <WeekHoursRows week={week} disabled={!sch} onChange={saveWeek} />
        <SRow title="Week starts">
          <SSelect
            label="Week starts"
            value={s?.weekStartDay ?? "monday"}
            options={WEEK}
            disabled={!s}
            onChange={(v) => save({ weekStartDay: v })}
          />
        </SRow>
        <SRow title="Time zone">
          <SSelect
            label="Time zone"
            width={170}
            value={s?.timeZone ?? "UTC"}
            options={zoneOptions(s?.timeZone ?? "UTC")}
            disabled={!s}
            onChange={(v) => save({ timeZone: v })}
          />
        </SRow>
      </SGroup>
      <PersonalDefaults />
      <SGroup title="Calendar">
        <SRow title="Time format" desc="How times read on the calendar.">
          <SSelect
            label="Time format"
            value={s?.timeFormat === "12h" ? "12h" : "24h"}
            options={CLOCKS}
            disabled={!s}
            onChange={(v) => save({ timeFormat: v })}
          />
        </SRow>
        <SRow
          title="Calendar opens in"
          desc="Week shows the grid; Agenda lists each day's events and tasks in order."
        >
          <SSelect
            label="Calendar opens in"
            value={s?.defaultView === "days" ? "days" : "week"}
            options={VIEWS}
            disabled={!s}
            onChange={(v) => save({ defaultView: v })}
          />
        </SRow>
      </SGroup>
      <SGroup>
        <SRow
          title="Planning options"
          desc={
            open
              ? "How Needt fills your free time."
              : planningSummary({
                  weekends,
                  bufferMinutes: sch?.bufferMinutes ?? 15,
                })
          }
          onClick={() => setOpen((o) => !o)}
          expanded={open}
          lead={
            <span className={"settings-adv-chev" + (open ? " is-open" : "")}>
              <FiChevronRight size={14} aria-hidden />
            </span>
          }
        />
        {open ? (
          <>
            <SRow
              title="Gap between tasks"
              desc="Free time left between two planned tasks."
            >
              <SSelect
                label="Gap between tasks"
                width={110}
                value={String(sch?.bufferMinutes ?? 15)}
                options={minutes([0, 5, 10, 15])}
                disabled={!sch}
                onChange={(v) => saveSchedule({ bufferMinutes: Number(v) })}
              />
            </SRow>
            {/* //todo: Plan automatically, Plan my day puts first (Pro), Keep
                focus blocks free and Shortest work block have no scheduler
                setting behind them yet; they come back with the scheduling
                engine work (docs/port/prototype/FROZEN.md open items). */}
          </>
        ) : null}
      </SGroup>
    </>
  );
}
