"use client";

import { useMemo, useState } from "react";

import { LuChevronDown } from "react-icons/lu";

import { useSchedule, useUpdateSchedule } from "@/lib/needt3/hooks/account";
import {
  useSetPref,
  useSettings,
  useUpdateSettings,
} from "@/lib/needt3/hooks/settings";

import { zoneOptions } from "../../settings/DaySection";
import { useMark } from "../../settings/SettingsContext";
import {
  hourLabel,
  hourOf,
  minutes,
  parseWorkDays,
  planningSummary,
  plansWeekends,
  withWeekends,
  workHourChoices,
  workHoursValid,
} from "../../settings/derive";
import { pkCx } from "../kit";
import { VIEW_OPTIONS, WEEK_OPTIONS } from "./model";
import { PsGroup, PsPick, PsRow, PsSeg, PsSwitch } from "./parts";

const noop = () => undefined;

/**
 * Your day. The desktop's rules, unchanged:
 *   - working hours are written only once the schedule has loaded (the
 *     weekday list is rebuilt from what was read, so an unloaded write would
 *     drop every weekday), and only when start is before end;
 *   - week start, zone and the calendar's view are `UserSettings` columns, off
 *     until settings load;
 *   - Hide done is the calendar's own `prefs.calHideDone`, merged into the
 *     loaded prefs only (`useSetPref` refuses before they load).
 *
 * //todo: Plan automatically, Plan my day puts first (Pro), Keep focus blocks
 * free and Shortest work block have no scheduler setting behind them yet; they
 * are not drawn, as on the desktop.
 */
export function DayPage() {
  const mark = useMark();
  const settings = useSettings();
  const update = useUpdateSettings();
  const setPref = useSetPref();
  const schedule = useSchedule();
  const setSchedule = useUpdateSchedule();
  const [open, setOpen] = useState(false);
  const s = settings.data;
  const sch = schedule.data;
  const days = useMemo(() => parseWorkDays(sch?.workDays), [sch?.workDays]);
  const weekends = plansWeekends(days);

  const save = (patch: Parameters<typeof update.mutateAsync>[0]) =>
    void update.mutateAsync(patch).then(mark).catch(noop);
  const saveSchedule = (
    patch: Parameters<typeof setSchedule.mutateAsync>[0]
  ) => {
    if (!sch) return;
    void setSchedule.mutateAsync(patch).then(mark).catch(noop);
  };
  const saveHours = (start: number, end: number) => {
    if (!workHoursValid(start, end)) return;
    saveSchedule({ workHourStart: start, workHourEnd: end });
  };
  const start = sch?.workHourStart ?? 9;
  const end = sch?.workHourEnd ?? 17;
  const hideDone = s?.prefs.calHideDone === true;

  return (
    <>
      <PsGroup
        title="Working hours"
        hint="Needt only plans work between these times."
      >
        <PsPick
          title="Day starts"
          value={hourLabel(start)}
          options={workHourChoices("start", sch?.workHourStart, end)}
          disabled={!sch}
          onChange={(v) => {
            const h = hourOf(v);
            if (h !== null) saveHours(h, end);
          }}
          data={{ "data-ps-pick": "start" }}
        />
        <PsPick
          title="Day ends"
          value={hourLabel(end)}
          options={workHourChoices("end", sch?.workHourEnd, start)}
          disabled={!sch}
          onChange={(v) => {
            const h = hourOf(v);
            if (h !== null) saveHours(start, h);
          }}
          data={{ "data-ps-pick": "end" }}
        />
        <PsRow
          title="Week starts"
          control={
            <PsSeg
              label="Week starts"
              value={s?.weekStartDay === "sunday" ? "sunday" : "monday"}
              options={WEEK_OPTIONS}
              disabled={!s}
              onChange={(v) => save({ weekStartDay: v })}
            />
          }
        />
        <PsPick
          title="Time zone"
          value={s?.timeZone ?? "UTC"}
          options={zoneOptions(s?.timeZone ?? "UTC")}
          disabled={!s}
          onChange={(v) => save({ timeZone: v })}
        />
      </PsGroup>
      <PsGroup
        title="Calendar"
        hint="Week shows the grid; Agenda lists each day's events and tasks in order."
      >
        <PsRow
          title="Opens in"
          control={
            <PsSeg
              label="Calendar opens in"
              value={s?.defaultView === "days" ? "days" : "week"}
              options={VIEW_OPTIONS}
              disabled={!s}
              onChange={(v) => save({ defaultView: v })}
            />
          }
        />
        <PsRow
          title="Hide done"
          desc="Finished tasks leave the calendar."
          control={
            <PsSwitch
              label="Hide done in calendar"
              on={hideDone}
              disabled={!s}
              onChange={(v) =>
                void setPref("calHideDone", v)
                  .then((saved) => saved && mark())
                  .catch(noop)
              }
            />
          }
        />
      </PsGroup>
      <PsGroup>
        <PsRow
          title="Planning options"
          desc={
            open
              ? "How Needt fills your free time."
              : planningSummary({
                  weekends,
                  bufferMinutes: sch?.bufferMinutes ?? 15,
                })
          }
          chevron={false}
          expanded={open}
          onOpen={() => setOpen((o) => !o)}
          value={
            <span className={pkCx("ps-fold", open && "is-open")} aria-hidden>
              <LuChevronDown size={16} />
            </span>
          }
          data={{ "data-ps-adv": "" }}
        />
        {open ? (
          <>
            <PsPick
              title="Gap between tasks"
              desc="Free time left between two planned tasks."
              value={String(sch?.bufferMinutes ?? 15)}
              options={minutes([0, 5, 10, 15])}
              disabled={!sch}
              onChange={(v) => saveSchedule({ bufferMinutes: Number(v) })}
            />
            <PsRow
              title="Plan on weekends"
              desc="Off keeps Saturday and Sunday empty."
              control={
                <PsSwitch
                  label="Plan on weekends"
                  on={weekends}
                  disabled={!sch}
                  onChange={(on) =>
                    saveSchedule({
                      workDays: JSON.stringify(withWeekends(days, on)),
                    })
                  }
                />
              }
            />
          </>
        ) : null}
      </PsGroup>
    </>
  );
}
