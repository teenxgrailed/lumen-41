"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";

import { LuCheck, LuChevronDown } from "react-icons/lu";

import { proFromPlan } from "@/components/needt3/home/derive";

import { daySummary } from "@/lib/needt3/day-set";
import { addDays, addMinutes, project, stamp } from "@/lib/needt3/derive";
import { cvDur } from "@/lib/needt3/derive";
import { usePlanPicks } from "@/lib/needt3/hooks/day-plan";
import { useCalendars, useEvents } from "@/lib/needt3/hooks/events";
import {
  useCheckins,
  useHabits,
  useToggleHabitToday,
} from "@/lib/needt3/hooks/habits";
import { useHomeBlocks } from "@/lib/needt3/hooks/home-blocks";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { usePlanDay } from "@/lib/needt3/hooks/plan-day";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useSettings } from "@/lib/needt3/hooks/settings";
import { useTaskView } from "@/lib/needt3/hooks/task-view";
import { useTasks, useToggleTask } from "@/lib/needt3/hooks/tasks";
import type { V3Event, V3Task } from "@/lib/needt3/map";
import { projectColor } from "@/lib/needt3/project-color";
import { showsTask } from "@/lib/needt3/task-view";
import type { DayBand } from "@/lib/personal-time-days";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import {
  type CalItem,
  type CalTimed,
  calendarItems,
} from "../../calendar/blocks";
import { CAL_EMPTY_COPY, calendarEmptyState } from "../../calendar/empty";
import { c2Time, calDay, freeSlot, isoWeek } from "../../calendar/layout";
import { HaHabits, haHabitsOf } from "../../home/ha";
import { openPaywall } from "../../paywall/store";
import { PersonalDayBands } from "../../personal/PersonalBand";
import { PersonalQuickAdd } from "../../personal/PersonalQuickAdd";
import {
  StarterGameSlot,
  useStarterGameCard,
} from "../../starter-game/StarterGameSlot";
import { usePhoneClock } from "../home/clock";
import { PhoneState, hasContent } from "../home/parts";
import {
  PkButton,
  PkEmpty,
  PkScreen,
  PkSection,
  PkSkyPlate,
  pkCx,
} from "../kit";
import { PersonalBandSheet } from "../overlays/PersonalBandSheet";
import { snack } from "../overlays/snack";
import { usePhoneOverlays } from "../overlays/store";
import { MonthGrid, Step, WeekStrip } from "./Strips";
import {
  type CalView,
  type FreeWindow,
  combineQueries,
  dayMeta,
  dayPlan,
  eventFacts,
  freeWindows,
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
  ["schedule", copy.day],
  ["month", copy.month],
];

/**
 * CALENDAR on the phone (mobile-v2-plates.jsx `V2pCalendar`): the week strip
 * over one day's schedule, or the month grid over the picked day's items.
 * Today shows what is on now or next on a sky plate, then what is coming; the
 * past folds into one row above it ("Earlier today") and items with no time
 * sit under "No time", with an Auto-fit pill that runs Plan my day. Gaps of
 * 30 min or more between blocks say "1 h free · + Schedule" (critique 15.11).
 * The header is one row: the month with its ▾ menu and Day | Month.
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
  /* Personal time: the day's rows, a tapped one's sheet, the presets. */
  const [band, setBand] = useState<DayBand | null>(null);
  const [keeping, setKeeping] = useState(false);
  /* The month name's ▾ menu: Today, Add event, Keep time for you. */
  const [menu, setMenu] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  // an outside tap, and a day swipe (the picked day changing), close the menu
  useEffect(() => {
    if (!menu) return undefined;
    const away = (e: Event) => {
      const t = e.target as Element | null;
      if (!t?.closest("[data-v2p-calmenu], [data-v2p-month-menu]"))
        setMenu(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenu(false);
      menuBtn.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    // the first item takes focus, so the arrow keys have somewhere to start
    document
      .querySelector<HTMLElement>('[data-v2p-calmenu] [role^="menuitem"]')
      ?.focus();
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);
  const planQuery = usePlan();
  const planner = usePlanDay();
  const toggleTask = useToggleTask();
  const toggleHabit = useToggleHabitToday();
  const habitsQuery = useHabits();
  const checkinsQuery = useCheckins();
  const blocks = useHomeBlocks();

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
  const { timed, loose, doneHiddenByDay } = useMemo(
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
  // //todo: the week and month dots still count calendar items (events
  // included) per date; move them to the day set (`daySummary`, tasks only)
  // per day when the dots are next touched.
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    [...timed, ...loose].forEach((b) =>
      m.set(b.date, (m.get(b.date) ?? 0) + 1)
    );
    return m;
  }, [timed, loose]);
  const count = (d: string) => counts.get(d) ?? 0;

  const plan = dayPlan(timed, loose, day, today, hour);
  // The day line counts the day's TASKS from the one day set Home reads (the
  // plan's picks join on today), events apart. Only "done hidden" is what
  // Hide done really took off the grid for this day.
  const picks = usePlanPicks(today);
  // not said on a cold load either: no tasks yet is not "Nothing planned"
  const holdTasks =
    tasksQuery.data === undefined || (day === today && !picks.settled);
  const daySum = useMemo(
    () =>
      daySummary(
        tasksQuery.data ?? [],
        day,
        day === today ? picks.ids : undefined
      ),
    [tasksQuery.data, day, today, picks.ids]
  );
  const hiddenDone = doneHiddenByDay[day] ?? 0;
  const d = calDay(day);
  const week = weekOf(day, startDay);
  const grid = monthGrid(day, startDay);

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

  /* A free window, tapped: the new-event sheet on that slot, 30 minutes of it.
     (The quick-add composer takes a sentence, not a time, so it cannot be
     seeded; the event sheet can.) */
  const scheduleIn = (g: FreeWindow) => {
    const startAt = stamp(day, g.from) ?? `${day}T09:00`;
    openNewEvent({
      startAt,
      endAt: addMinutes(startAt, Math.min(g.len, 30)) ?? startAt,
    });
  };
  /* The free gaps between the day's blocks, drawn above the block they run up to. */
  const free = freeWindows(plan.timed, plan.isToday, plan.isPast, hour);
  const freeBefore = new Map(free.map((g) => [g.before, g]));
  const freeRow = (b: CalTimed) => {
    const g = freeBefore.get(b.id);
    return g ? (
      <button
        key={`free:${b.id}`}
        type="button"
        className="v2p-free"
        onClick={() => scheduleIn(g)}
        data-v2p-free={b.id}
        data-v2p-free-add={b.id}
      >
        <span className="v2p-free-text">{cvDur(g.len)} free</span>
        <span className="v2p-free-add">+ Schedule</span>
      </button>
    ) : null;
  };

  /* Auto-fit: Plan my day, the scheduler that places what has no time into
     the free hours (a Pro action; a Free person is shown the plans). */
  // a plan that failed to load is not "Free": the server decides on the tap
  // (it refuses a Free account itself), so a Pro person is never sent to the
  // plans because of a failed read
  const pro = planQuery.isError ? true : proFromPlan(planQuery.data?.kind);
  const unplaced = plan.allDay.filter((b) => !b.event && !b.done).length;
  const autoFit = () => {
    if (pro === false) openPaywall("Plan my day");
    else if (pro) void planner.plan();
  };

  const hueOf = (b: CalItem) => {
    if (b.event) return "var(--v2p-ink-3)";
    const p = project((b.entry as V3Task).projectId, projects ?? []);
    return p ? projectColor(p.id, p.color) : "var(--text-muted)";
  };

  /* The round check: a task is done in one tap, with the same Undo as
     everywhere (an event has none). */
  const completeTask = (b: CalItem) => {
    const t = b.entry as V3Task;
    void toggleTask
      .toggle(t)
      .then(({ undo }) => snack(t.done ? "Reopened" : "Done", undo))
      .catch(() => undefined);
  };
  const withCheck = (b: CalItem, row: ReactNode) =>
    b.event ? (
      row
    ) : (
      <div key={`${b.id}:${b.date}`} className="v2p-tlw">
        {row}
        <button
          type="button"
          className={pkCx("pk-check v2p-tl-check", b.done && "is-on")}
          aria-pressed={!!b.done}
          aria-label={b.done ? "Mark not done" : "Mark done"}
          onClick={() => completeTask(b)}
          data-v2p-check={b.id}
        >
          <span className="pk-check-ring">
            {b.done ? <LuCheck size={13} /> : null}
          </span>
        </button>
      </div>
    );

  /* Today's habits, one compact strip at the top of the day: tap to mark. */
  const haHabits = haHabitsOf(
    habitsQuery.data ?? [],
    checkinsQuery.data ?? [],
    today
  );
  const habitStrip =
    plan.isToday && blocks.habits && haHabits.length ? (
      <div className="ha-phone v2p-habstrip" data-v2p-habits="">
        <HaHabits
          habits={haHabits}
          onToggle={(id, done) =>
            void toggleHabit
              .mutateAsync({ id, done })
              .then(({ undo }) =>
                snack(done ? "Habit done" : "Habit unmarked", undo)
              )
              .catch(() => undefined)
          }
        />
      </div>
    ) : null;

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
  const rowOf = (b: CalTimed) => (
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
  const line = (b: CalTimed) => withCheck(b, rowOf(b));
  const looseRow = (b: CalItem) => (
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
  const looseLine = (b: CalItem) => withCheck(b, looseRow(b));
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
  /* The title is the month with its ▾: the header is one row, the month and
     the Day | Month switch. What used to sit in the day heading as "+ Event"
     and "Personal", and the Today jump, live in the menu the ▾ opens. */
  const title = (
    <button
      type="button"
      className="v2p-monthbtn"
      aria-haspopup="menu"
      aria-expanded={menu}
      ref={menuBtn}
      onClick={() => setMenu((on) => !on)}
      data-v2p-month-menu=""
    >
      {grid.month}
      <LuChevronDown
        size={18}
        aria-hidden="true"
        className={pkCx("v2p-monthbtn-chev", menu && "is-open")}
      />
    </button>
  );
  const pick = (run: () => void) => () => {
    setMenu(false);
    run();
  };
  const menuPanel = menu ? (
    <div
      className="v2p-calmenu"
      role="menu"
      data-v2p-calmenu=""
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const items = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]')
        );
        const at = items.indexOf(document.activeElement as HTMLElement);
        const step = e.key === "ArrowDown" ? 1 : -1;
        items[(at + step + items.length) % items.length]?.focus();
      }}
    >
      <p className="v2p-calmenu-cap">
        {view === "schedule"
          ? `Week ${isoWeek(week[3].date)} · ${weekRange(week)}`
          : `${grid.year} · tap a day`}
      </p>
      {day !== today ? (
        <button
          type="button"
          role="menuitem"
          className="v2p-calmenu-item"
          onClick={pick(() => setPicked(null))}
          data-v2p-menu-today=""
        >
          {copy.today}
        </button>
      ) : null}
      {/* Not in the prototype: its phone had no way to make an event. */}
      <button
        type="button"
        role="menuitem"
        className="v2p-calmenu-item"
        onClick={pick(newEvent)}
        data-p5-new-event=""
      >
        Add event
      </button>
      <button
        type="button"
        role="menuitemcheckbox"
        className="v2p-calmenu-item"
        aria-checked={keeping}
        onClick={pick(() => setKeeping((on) => !on))}
        data-p5-personal=""
      >
        {keeping ? "Stop keeping time" : "Keep time for you"}
      </button>
    </div>
  ) : null;

  const head = (name: string) => (
    <div className="v2p-dayhead">
      <span className="v2p-dayhead-name">{name}</span>
      <span className="v2p-dayhead-meta">
        {dayMeta(plan, holdTasks ? null : daySum, hiddenDone)}
        {plan.pairs ? (
          <span className="v2p-dayhead-clash">
            {` · ${plan.pairs} ${plan.pairs === 1 ? "overlap" : "overlaps"}`}
          </span>
        ) : null}
      </span>
      {keeping ? (
        <PersonalQuickAdd date={day} label="Kept for you. No task goes there" />
      ) : null}
      <PersonalDayBands date={day} onOpen={(b) => setBand(b)} />
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
  const starter = useStarterGameCard();
  // the empty week (calendar/empty.ts), on the schedule only: the month grid
  // is not a week
  const weekEmpty =
    view === "schedule"
      ? calendarEmptyState({
          feeds: calendars,
          items: [...timed, ...loose],
          days: week.map((w) => w.date),
        })
      : null;
  const freeDay =
    !plan.timed.length && !plan.allDay.length && !starter.show && !starter.hold;
  const empty = (
    <>
      <StarterGameSlot screen="calendar" />
      {weekEmpty === "connect" ? (
        <div className="v2p-cal-empty" data-v2p-cal-empty="connect">
          <PkEmpty
            line={CAL_EMPTY_COPY.line}
            action={
              <>
                <Link
                  className="pk-btn is-primary is-small"
                  href="/connections"
                  data-v2p-cal-connect=""
                >
                  <span className="pk-btn-cut">{CAL_EMPTY_COPY.connect}</span>
                </Link>
                <PkButton small onClick={newEvent} data-v2p-cal-add="">
                  {CAL_EMPTY_COPY.add}
                </PkButton>
              </>
            }
          />
        </div>
      ) : freeDay ? (
        <PkEmpty
          line={
            weekEmpty === "quiet"
              ? CAL_EMPTY_COPY.quiet
              : copy.a_free_day_pull_down_to_add_something_to
          }
        />
      ) : null}
    </>
  );
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
      title={title}
      headClass="is-cal"
      right={seg}
      head={menuPanel}
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
                {habitStrip}

                {/* what is over folds into one quiet row above the Now line */}
                {plan.earlier.length ? (
                  <PkSection
                    className="v2p-fold is-earlier"
                    title={copy.earlier_today}
                    count={plan.earlier.length}
                    folded={fold.past}
                    onFold={flip("past")}
                  >
                    <div data-v2p-earlier="">{plan.earlier.map(line)}</div>
                  </PkSection>
                ) : null}

                {plateB ? freeRow(plateB) : null}
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
                      i === plan.nowAt
                        ? [nowLine, b === plateB ? null : freeRow(b), line(b)]
                        : [b === plateB ? null : freeRow(b), line(b)]
                    )}
                    {plan.isToday && plan.nowAt < 0 ? nowLine : null}
                  </div>
                ) : null}
                {noTime}
                {empty}
              </div>
              {unplaced && plan.isToday && pro !== null ? (
                <div className="v2p-autofit" data-v2p-autofit="">
                  <button
                    type="button"
                    className="v2p-autofit-pill"
                    onClick={autoFit}
                    disabled={planner.busy}
                    aria-busy={planner.busy || undefined}
                    data-v2p-autofit-go=""
                  >
                    Auto-fit
                  </button>
                </div>
              ) : null}
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
                  <div className="v2p-timeline">
                    {plan.timed.map((b) => [freeRow(b), line(b)])}
                  </div>
                ) : null}
                {noTime}
                {empty}
              </div>
            </div>
          )}
        </div>
      ) : null}
      <PersonalBandSheet band={band} onClose={() => setBand(null)} />
    </PkScreen>
  );
}
