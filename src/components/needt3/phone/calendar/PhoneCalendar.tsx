"use client";

import { type ReactNode, useMemo, useRef } from "react";

import { LuPlus } from "react-icons/lu";

import { addDays, addMinutes, project, stamp } from "@/lib/needt3/derive";
import { cvDur } from "@/lib/needt3/derive";
import { useCalendars, useEvents } from "@/lib/needt3/hooks/events";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useSettings } from "@/lib/needt3/hooks/settings";
import { useTaskView } from "@/lib/needt3/hooks/task-view";
import { useTasks } from "@/lib/needt3/hooks/tasks";
import type { V3Event, V3Task } from "@/lib/needt3/map";
import { showsTask } from "@/lib/needt3/task-view";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import {
  type CalItem,
  type CalTimed,
  calendarItems,
} from "../../calendar/blocks";
import { c2Time, calDay, freeSlot, isoWeek } from "../../calendar/layout";
import { usePhoneClock } from "../home/clock";
import { PhoneState, hasContent } from "../home/parts";
import { useTaskPull } from "../home/pull";
import {
  PkButton,
  PkEmpty,
  PkScreen,
  PkSection,
  PkSkyPlate,
  pkCx,
} from "../kit";
import { usePhoneOverlays } from "../overlays/store";
import { MonthGrid, Step, WeekStrip } from "./Strips";
import {
  type CalView,
  combineQueries,
  dayMeta,
  dayPlan,
  eventFacts,
  itemLabel,
  monthGrid,
  nowProgress,
  rangeLabel,
  stepMonth,
  visibleRange,
  weekOf,
  weekRange,
} from "./model";
import type { CalendarController } from "./useCalendarController";
import { useSwipeStep } from "./useSwipeStep";

const copy = strings["mobile-v2-plates.jsx"].V2pCalendar;
const VIEWS: readonly [CalView, string][] = [
  ["schedule", copy.schedule],
  ["month", copy.month],
];

/**
 * CALENDAR on the phone (mobile-v2-plates.jsx `V2pCalendar`): the week strip
 * over one day's schedule, or the month grid over the picked day's items.
 * Today shows what is on now or next on a sky plate, then what is coming; the
 * past folds under "Earlier today" and items with no time under "No time".
 * Items that collide with a calendar event say so. A task opens the task
 * sheet, an event the event sheet (read-only: a synced or recurring event
 * cannot be changed here, and the sheet only reads). Add event writes a
 * Needt-calendar event through `useCreateEvent` (the sheet is P3's).
 */
export function PhoneCalendar({ ctl }: { ctl: CalendarController }) {
  const { today, hour } = usePhoneClock();
  const settings = useSettings();
  const startDay = settings.data?.weekStartDay ?? "monday";
  const hideDone = settings.data?.prefs?.calHideDone === true;
  const openTask = usePhoneOverlays((s) => s.openTask);
  const openEvent = usePhoneOverlays((s) => s.openEvent);
  const openNewEvent = usePhoneOverlays((s) => s.openNewEvent);

  const { view, setView, picked, setPicked, fold, flip } = ctl;
  const day = picked ?? today;

  const tasksQuery = useTasks();
  const range = visibleRange(day, startDay);
  const eventsQuery = useEvents(range);
  // Paging into another month asks for another range. The last list stays
  // drawn until it arrives, so the strip and the day do not blink into a
  // skeleton on every month change; an error still shows as one.
  const heldEvents = useRef<V3Event[] | undefined>(undefined);
  if (eventsQuery.data) heldEvents.current = eventsQuery.data;
  const events =
    eventsQuery.data ??
    (eventsQuery.status === "pending" ? heldEvents.current : undefined);
  const projects = useProjects().data;
  const calendars = useCalendars().data;
  const calendarNames = useMemo(
    () => new Map((calendars ?? []).map((c) => [c.id, c.name])),
    [calendars]
  );
  const ownCalendarIds = useMemo(
    () => new Set((calendars ?? []).map((c) => c.id)),
    [calendars]
  );
  const taskView = useTaskView();
  const tasks = useMemo(
    () => (tasksQuery.data ?? []).filter((t) => showsTask(t, taskView, today)),
    [tasksQuery.data, taskView, today]
  );
  const { timed, loose } = useMemo(
    () =>
      calendarItems({
        tasks,
        events: events ?? [],
        projects,
        calendarNames,
        ownCalendarIds,
        today,
        hideDone,
      }),
    [tasks, events, projects, calendarNames, ownCalendarIds, today, hideDone]
  );
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    [...timed, ...loose].forEach((b) =>
      m.set(b.date, (m.get(b.date) ?? 0) + 1)
    );
    return m;
  }, [timed, loose]);
  const count = (d: string) => counts.get(d) ?? 0;

  const plan = dayPlan(timed, loose, day, today, hour);
  const d = calDay(day);
  const week = weekOf(day, startDay);
  const grid = monthGrid(day, startDay);
  const pull = useTaskPull(tasks, today);

  const step = (k: -1 | 1) =>
    setPicked(view === "month" ? stepMonth(day, k) : addDays(day, 7 * k));
  // the arrows page a week; a swipe over the day moves to the next or the
  // previous day (a month in the month grid), as Notion Calendar does
  const swipe = useSwipeStep((k) =>
    setPicked(view === "month" ? stepMonth(day, k) : addDays(day, k))
  );

  const tap = (b: CalItem) => {
    if (!b.event) {
      openTask(b.entry as V3Task);
      return;
    }
    openEvent(eventFacts(b, plan.clash));
  };
  const newEvent = () => {
    const at = freeSlot(plan.timed, day, plan.isToday ? hour : 9);
    const startAt = stamp(day, at) ?? `${day}T09:00`;
    openNewEvent({ startAt, endAt: addMinutes(startAt, 60) ?? startAt });
  };

  const hueOf = (b: CalItem) =>
    b.event
      ? "var(--v2p-ink-3)"
      : (project((b.entry as V3Task).projectId, projects ?? [])?.color ??
        "var(--text-muted)");

  const overlap = (b: CalItem) =>
    plan.clash[b.id] ? (
      <span className="v2p-clash" data-v2p-clash={b.id}>
        <span className="v2p-clash-mark" aria-hidden="true" />
        <span className="v2p-clash-text">
          {copy.overlaps} {plan.clash[b.id].join(", ")}
        </span>
      </span>
    ) : null;
  const ended = (b: CalTimed) => plan.isToday && b.at + b.len / 60 <= hour;
  const line = (b: CalTimed) => (
    <button
      key={b.id}
      type="button"
      className={pkCx("v2p-tl", ended(b) && "is-past", b.done && "is-done")}
      onClick={() => tap(b)}
      data-v2p-tl={b.id}
    >
      <span className="v2p-tl-time">
        <span>{c2Time(b.at)}</span>
        <span className="v2p-tl-end">{c2Time(b.at + b.len / 60)}</span>
      </span>
      <span className="v2p-tl-main">
        <span className="v2p-tl-title">{b.title}</span>
        <span className="v2p-tl-meta">
          <span
            className="pk-hue"
            style={{ "--hue": hueOf(b) } as React.CSSProperties}
          />
          {cvDur(b.len)} · {itemLabel(b)}
        </span>
        {overlap(b)}
      </span>
    </button>
  );
  const looseLine = (b: CalItem) => (
    <button
      key={`${b.id}:${b.date}`}
      type="button"
      className={pkCx("v2p-tl is-loose", b.done && "is-done")}
      onClick={() => tap(b)}
      data-v2p-tl={b.id}
    >
      <span className="v2p-tl-main">
        <span className="v2p-tl-title">{b.title}</span>
        <span className="v2p-tl-meta">
          <span
            className="pk-hue"
            style={{ "--hue": hueOf(b) } as React.CSSProperties}
          />
          {b.len ? `${cvDur(b.len)} · ` : ""}
          {itemLabel(b)}
        </span>
      </span>
    </button>
  );
  const nowLine = (
    <div key="now" className="v2p-now" data-v2p-now="">
      <span className="v2p-now-dot" />
      <span className="v2p-now-text">
        {copy.now} {c2Time(hour)}
      </span>
      <span className="v2p-now-rule" />
    </div>
  );

  const seg = (
    <span className="v2p-seg" role="radiogroup" aria-label={copy.view}>
      {VIEWS.map(([id, l]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={view === id}
          className={pkCx("v2p-seg-btn", view === id && "is-on")}
          onClick={() => setView(id)}
          data-v2p-view-btn={id}
        >
          {l}
        </button>
      ))}
    </span>
  );
  const sub = (
    <>
      {view === "schedule"
        ? `Week ${isoWeek(week[3].date)} · ${weekRange(week)}`
        : `${grid.year} · tap a day`}
      {day !== today ? (
        <PkButton kind="inline" onClick={() => setPicked(null)}>
          {copy.today}
        </PkButton>
      ) : null}
    </>
  );

  const head = (name: string) => (
    <div className="v2p-dayhead">
      <span className="v2p-dayhead-name">{name}</span>
      <span className="v2p-dayhead-meta">
        {dayMeta(plan)}
        {plan.pairs ? (
          <span className="v2p-dayhead-clash">
            {` · ${plan.pairs} ${plan.pairs === 1 ? "overlap" : "overlaps"}`}
          </span>
        ) : null}
        {/* Not in the prototype: its phone had no way to make an event. */}
        <PkButton
          kind="inline"
          icon={<LuPlus size={13} />}
          onClick={newEvent}
          aria-label="Add event"
          data-p5-new-event=""
        >
          Event
        </PkButton>
      </span>
    </div>
  );
  const noTime: ReactNode = plan.allDay.length ? (
    <PkSection
      className="v2p-fold"
      title={copy.no_time}
      count={plan.allDay.length}
      folded={fold.loose}
      onFold={flip("loose")}
    >
      {plan.allDay.map(looseLine)}
    </PkSection>
  ) : null;
  const empty =
    !plan.timed.length && !plan.allDay.length ? (
      <PkEmpty line={copy.a_free_day_pull_down_to_add_something_to} />
    ) : null;
  const plateB = plan.plate;

  const query = combineQueries(
    tasksQuery,
    events !== undefined && eventsQuery.data === undefined
      ? { ...eventsQuery, status: "success", data: events, error: null }
      : eventsQuery
  );
  const ready = hasContent(query);
  const dayName = plan.isToday ? copy.today : d.long;

  return (
    <PkScreen
      screen="calendar"
      glyph="calendar"
      title={grid.month}
      headClass="is-cal"
      right={seg}
      sub={sub}
      onPull={ready ? pull : undefined}
    >
      {/* a list skeleton: the "calendar" one is the desktop's seven-column week grid */}
      <PhoneState query={query} screen="calendar" />
      {ready ? (
        <div data-v2p-view={view} className="v2p-cal-body">
          {view === "schedule" ? (
            <div key="schedule" className="v2p-swap" {...swipe}>
              <div className="v2p-week-row">
                <Step dir={-1} label={copy.previous_week} onStep={step} />
                <WeekStrip
                  week={week}
                  startDay={startDay}
                  selDay={day}
                  today={today}
                  count={count}
                  onPick={setPicked}
                />
                <Step dir={1} label={copy.next_week} onStep={step} />
              </div>

              <div key={day} className="v2p-swap">
                {head(dayName)}

                {plateB ? (
                  <PkSkyPlate
                    as="button"
                    type="button"
                    className="v2p-evplate"
                    onClick={() => tap(plateB)}
                    data-v2p-plate={plateB.id}
                  >
                    <span className="v2p-next-top">
                      <span
                        className={pkCx(
                          "v2p-next-label",
                          plateB === plan.nowB && "is-now"
                        )}
                      >
                        {plateB === plan.nowB ? (
                          <span className="v2p-now-dot" />
                        ) : null}
                        {plateB === plan.nowB
                          ? copy.now
                          : plan.isToday
                            ? copy.next
                            : copy.first_up}
                      </span>
                      <span className="v2p-next-when">{plan.plateLine}</span>
                    </span>
                    <span className="v2p-ev-title">{plateB.title}</span>
                    <span className="v2p-ev-line">
                      {rangeLabel(plateB)} · {cvDur(plateB.len)} ·{" "}
                      {itemLabel(plateB)}
                    </span>
                    {overlap(plateB)}
                    {plateB === plan.nowB ? (
                      <span className="v2p-ev-bar" aria-hidden="true">
                        <span
                          className="v2p-ev-bar-fill"
                          style={
                            {
                              "--p": nowProgress(plateB, hour).toFixed(3),
                            } as React.CSSProperties
                          }
                        />
                      </span>
                    ) : null}
                  </PkSkyPlate>
                ) : null}

                {plan.coming.length || (plan.isToday && plateB) ? (
                  <div className="v2p-timeline" data-v2p-coming="">
                    {plan.coming.map((b, i) =>
                      i === plan.nowAt ? [nowLine, line(b)] : line(b)
                    )}
                    {plan.isToday && plan.nowAt < 0 ? nowLine : null}
                  </div>
                ) : null}
                {noTime}
                {plan.earlier.length ? (
                  <PkSection
                    className="v2p-fold"
                    title={copy.earlier_today}
                    count={plan.earlier.length}
                    folded={fold.past}
                    onFold={flip("past")}
                  >
                    <div data-v2p-earlier="">{plan.earlier.map(line)}</div>
                  </PkSection>
                ) : null}
                {empty}
              </div>
            </div>
          ) : (
            <div key="month" className="v2p-swap" {...swipe}>
              <div className="p5-month-steps">
                <Step dir={-1} label="Previous month" onStep={step} />
                <Step dir={1} label="Next month" onStep={step} />
              </div>
              <MonthGrid
                month={grid.month}
                cells={grid.cells}
                startDay={startDay}
                selDay={day}
                today={today}
                count={count}
                onPick={setPicked}
              />
              <div
                key={day}
                className="v2p-swap v2p-month-day"
                data-v2p-month-day={day}
              >
                {head(`${plan.isToday ? copy.today : d.wd} ${d.n} ${d.mo}`)}
                {plan.timed.length ? (
                  <div className="v2p-timeline">{plan.timed.map(line)}</div>
                ) : null}
                {noTime}
                {empty}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </PkScreen>
  );
}
