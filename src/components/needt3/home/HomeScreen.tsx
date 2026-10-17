"use client";

import { useCallback, useMemo, useRef } from "react";

import { useRouter } from "next/navigation";

import { FiCalendar, FiPlus } from "react-icons/fi";

import { useStartFocus } from "@/components/needt3/focus/useFocusController";
import { RichMenu } from "@/components/needt3/menu/RichMenu";
import { openPaywall } from "@/components/needt3/paywall/store";
import { HomeFaces } from "@/components/needt3/phone/home/HomeFaces";
import type {
  HomeController,
  HomeTab,
} from "@/components/needt3/phone/home/useHomeController";
import { StScreen } from "@/components/needt3/states/StScreen";
import { Task } from "@/components/needt3/task/Task";
import { TaskViewGear } from "@/components/needt3/task/TaskViewGear";
import { useNeedtReducedMotion } from "@/components/providers/MotionRuntime";

import { formatInTimeZone } from "@/lib/date-utils";
import {
  addDays,
  habitDoneOn,
  habitKept,
  liveHabits,
  moveDay,
  project,
} from "@/lib/needt3/derive";
import { useNow } from "@/lib/needt3/hooks/clock";
import { useDailyNote } from "@/lib/needt3/hooks/daily-note";
import { useCreateDoc } from "@/lib/needt3/hooks/docs";
import { useEvents } from "@/lib/needt3/hooks/events";
import {
  useCheckins,
  useHabits,
  useToggleHabitToday,
} from "@/lib/needt3/hooks/habits";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { usePlanDay } from "@/lib/needt3/hooks/plan-day";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useSettings, useTimeZone } from "@/lib/needt3/hooks/settings";
import { useTaskView } from "@/lib/needt3/hooks/task-view";
import {
  useTasks,
  useToggleTask,
  useUpdateTask,
} from "@/lib/needt3/hooks/tasks";
import type { V3Habit, V3Task } from "@/lib/needt3/map";
import { showsTask } from "@/lib/needt3/task-view";
import { todayLine } from "@/lib/needt3/today";
import { notify } from "@/lib/notifications";

import { useNeedt3Ui } from "@/store/needt3-ui";

import {
  Capped,
  DayClosed,
  EmptyDay,
  Fold,
  type HabitChip,
  HabitsCard,
  InboxCard,
  NextUpCard,
  NextUpNone,
  NotesLine,
  PlanButton,
  type ProState,
  ProgressCard,
  Schedule,
  StreakCard,
  WeekLoad,
  WeekStats,
} from "./HomeParts";
import {
  capacityFrom,
  dayState,
  dayStats,
  dayStreak,
  dur,
  nextUpNote,
  pickNextUp,
  proFromPlan,
  scheduleItems,
  sectionsOf,
  skipNext,
  splitHome,
  weekAhead,
  weekTotals,
} from "./derive";

/**
 * HOME ($P/HomeToday.jsx). The day on the Tasks layout: a header with the
 * date and the tabs, a summary row (Next up as the main accent, progress and
 * habits beside it), the day's sections on the left and a rail on the right.
 * Day | Week ahead; a closed day says so once and points at tomorrow.
 */

/** The strike plays, then the row collapses, then it is gone (ms). */
const STRIKE_MS = 600;
const GONE_MS = 870;
const BACK_MS = 320;

type Tab = HomeTab;

function DesktopHome({ ctl }: { ctl: HomeController }) {
  const router = useRouter();
  const tz = useTimeZone();
  const reduced = useNeedtReducedMotion();
  const now = useNow();
  const today = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const [hh, mm] = formatInTimeZone(now, tz, "HH:mm").split(":");
  const nowHour = +hh + +mm / 60;

  const tasksQuery = useTasks();
  const events = useEvents({ from: today, to: addDays(today, 8) });
  const habitsQuery = useHabits();
  const checkinsQuery = useCheckins();
  const projects = useProjects();
  const settings = useSettings();
  const plan = usePlan();
  const planner = usePlanDay();
  const dailyNote = useDailyNote(today);
  const toggleTask = useToggleTask();
  const updateTask = useUpdateTask();
  const toggleHabit = useToggleHabitToday();
  const createDoc = useCreateDoc();
  const { setComposerOpen } = useNeedt3Ui();
  const startFocusOn = useStartFocus();

  // The route's controller (created above the face switch, so a resize across
  // 700 px keeps all of it): tab, folds, Skip, the rows playing their exit and
  // the timers that end them.
  const {
    tab,
    setTab,
    fold,
    setFold,
    leaving,
    setLeaving,
    back,
    setBack,
    skipped,
    setSkipped,
    closed,
    timers,
  } = ctl;
  const scrollRef = useRef<HTMLDivElement>(null);

  const allTasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const taskView = useTaskView();
  const { late, day, inbox } = useMemo(
    () => splitHome(allTasks, today, taskView),
    [allTasks, today, taskView]
  );
  const leavingIds = useMemo(() => new Set(Object.keys(leaving)), [leaving]);

  // One rule for every section: it lists open tasks (plus a row still playing
  // its exit) and a section with nothing open is not drawn at all.
  const shown = (t: V3Task) => !t.done || !!leaving[t.id];
  const lateOpen = late.filter((t) => !leaving[t.id]);
  const dayOpen = day.filter((t) => !t.done && !leaving[t.id]);
  const stats = dayStats(day);
  const state = dayState(day, late.length, leavingIds);
  const closedDay = state === "closed";
  const doneToday = day.filter(
    (t) => t.done && !leaving[t.id] && showsTask(t, taskView, today)
  );
  const sections = closedDay ? [] : sectionsOf(day, shown, today);
  const lateShown = late.filter(shown);
  const inboxShown = inbox.filter(shown);

  const pick = pickNextUp(lateOpen, dayOpen, skipped);
  const canPlan = allTasks.some((t) => !t.done && !t.isFixed);
  // unknown (loading / failed) is neither Pro nor Free: nothing Pro-only is
  // unlocked and nothing is upsold until the plan is known
  const pro: ProState = proFromPlan(plan.data?.kind);

  const habits = liveHabits(habitsQuery.data ?? []);
  const checkins = checkinsQuery.data ?? [];
  const chips: HabitChip[] = habits.map((h) => ({
    habit: h,
    on: habitDoneOn(h.id, today, checkins),
    tip: `${h.schedule.time ? `${h.schedule.time} · ` : ""}${habitKept(h.id, checkins, today)} of the last 14`,
  }));
  const habitsKept = chips.filter((c) => c.on).length;

  const cap = capacityFrom(settings.data?.prefs);
  const week = weekAhead(allTasks, events.data ?? [], today, cap);
  const totals = weekTotals(week);
  const weekOpen = week.reduce(
    (s, w) => s + w.tasks.filter((t) => !t.done).length,
    0
  );
  const sched = scheduleItems(
    day.filter((t) => !t.noSlot),
    events.data ?? [],
    today
  );
  const hueOf = (id: string | null) =>
    project(id, projects.data ?? [])?.color ?? "var(--text-muted)";

  const open = useCallback(
    (id: string) => router.push(`/tasks?task=${id}`),
    [router]
  );
  const newTask = () => setComposerOpen(true);
  // A locked feature opens the Pro sheet, on what was asked for.
  const upgradePlan = () => openPaywall("Plan my day");
  const upgradeWeek = () => openPaywall("Week load");
  // Plan my day runs the real scheduler (preview, apply, one Undo); it is a
  // Pro action, so a Free person never reaches it (PlanButton opens the plans).
  const planDay = () => void planner.plan();
  const openNote = async () => {
    const id = await dailyNote.open();
    if (id) router.push(`/pages/${id}`);
  };
  const streak = dayStreak(allTasks, today);

  const clearTimers = useCallback(
    (id: string) => {
      (timers.current[id] ?? []).forEach(clearTimeout);
      delete timers.current[id];
    },
    [timers]
  );
  const drop = <T,>(
    set: (f: (m: Record<string, T>) => Record<string, T>) => void,
    id: string
  ) =>
    set((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });

  /**
   * The check writes first, always; the row's exit is only the page catching
   * up. Under reduced motion the row leaves at once.
   */
  const check = useCallback(
    (t: V3Task) => {
      void toggleTask.toggle(t).catch(() => undefined);
      clearTimers(t.id);
      if (!t.done) {
        closed.current = closed.current.filter((x) => x !== t.id).concat(t.id);
        if (reduced) return;
        setLeaving((m) => ({ ...m, [t.id]: "strike" }));
        timers.current[t.id] = [
          window.setTimeout(
            () =>
              setLeaving((m) => (m[t.id] ? { ...m, [t.id]: "collapse" } : m)),
            STRIKE_MS
          ),
          window.setTimeout(() => {
            drop(setLeaving, t.id);
            delete timers.current[t.id];
          }, GONE_MS),
        ];
      } else {
        closed.current = closed.current.filter((x) => x !== t.id);
        drop(setLeaving, t.id);
        if (reduced) return;
        setBack((m) => ({ ...m, [t.id]: true }));
        timers.current[t.id] = [
          window.setTimeout(() => {
            drop(setBack, t.id);
            delete timers.current[t.id];
          }, BACK_MS),
        ];
      }
    },
    [toggleTask, reduced, clearTimers, closed, timers, setLeaving, setBack]
  );

  const undoLast = () => {
    const id = closed.current[closed.current.length - 1];
    const t =
      (id ? allTasks.find((x) => x.id === id && x.done) : undefined) ??
      [...day].reverse().find((x) => x.done);
    if (t) check(t);
  };

  const checkById = (id: string) => {
    const t = allTasks.find((x) => x.id === id);
    if (t) check(t);
  };

  /** Plan tomorrow: the Week ahead tab, Tomorrow first and unfolded. */
  const seeTomorrow = () => {
    setTab("week");
    setFold((f) => ({ ...f, [`w${week[0]?.date}`]: false }));
    window.setTimeout(
      () =>
        scrollRef.current?.scrollTo({
          top: 0,
          behavior: reduced ? "auto" : "smooth",
        }),
      60
    );
  };

  //todo: closing the last open part should close the parent, inside the
  // part-toggle mutation (one write, one undo) — not as an effect here that
  // fires on every cache change.

  /** Move every open overdue task onto today; one Undo puts them all back. */
  const moveToToday = async () => {
    const list = late.filter((t) => !t.done);
    if (!list.length) return;
    // each move stands alone: one failure (already reported and rolled back
    // by the mutation) must not take the others' Undo with it
    const settled = await Promise.allSettled(
      list.map((t) =>
        updateTask.mutateAsync({ id: t.id, patch: moveDay(t, today, today) })
      )
    );
    const moved = settled.flatMap((r) =>
      r.status === "fulfilled" ? [r.value] : []
    );
    if (!moved.length) return;
    notify.success(
      `${moved.length} ${moved.length === 1 ? "task" : "tasks"} moved to today`,
      {
        action: {
          label: "Undo",
          onClick: () => void Promise.allSettled(moved.map((d) => d.undo())),
        },
      }
    );
  };

  const startFocus = () => {
    if (!pick) return;
    // A 25-minute session on the task: the window opens on its clock and one
    // notice says it began (useStartFocus). Nothing claims a start that failed.
    void startFocusOn(pick.task);
  };

  const onHabit = (h: V3Habit, done: boolean) =>
    void toggleHabit.mutateAsync({ id: h.id, done }).catch(() => undefined);

  const newDoc = async () => {
    try {
      const { result } = await createDoc.mutateAsync({ draft: {} });
      if (result) router.push(`/pages/${result.id}`);
    } catch {
      // the mutation already told the person
    }
  };

  const row = (t: V3Task, isLate = false) => (
    <Task
      key={t.id}
      layout="row"
      task={t}
      late={isLate}
      phase={leaving[t.id]}
      back={back[t.id]}
      onToggle={() => check(t)}
      onOpen={open}
      today={today}
    />
  );
  const flip = (k: string) => () => setFold((f) => ({ ...f, [k]: !f[k] }));

  const planButton = (small?: boolean, primary?: boolean) => (
    <PlanButton
      pro={pro}
      canPlan={canPlan}
      onPlan={planDay}
      onLocked={upgradePlan}
      primary={primary}
      small={small}
      busy={planner.busy}
    />
  );

  const tabs: [Tab, string, number][] = [
    ["day", "Day", stats.left],
    ["week", "Week ahead", weekOpen],
  ];
  const { date: dateLine, week: weekNo } = todayLine(
    now,
    tz,
    settings.data?.weekStartDay ?? "monday"
  );

  const lateFold = lateShown.length ? (
    <Fold
      title="Overdue"
      tone="late"
      count={late.length}
      open={!fold.late}
      onToggle={flip("late")}
      note="These were due before today — move them or let them go."
      action={
        <button
          type="button"
          className="nx-btn nx-btn-sm nx-btn-secondary hd-move-today"
          onClick={() => void moveToToday()}
        >
          Move to today
        </button>
      }
    >
      <Capped list={lateShown} render={(t) => row(t, true)} />
    </Fold>
  ) : null;

  return (
    <div className="hd-home hd-screen" data-v3-screen="home">
      <header className="hd-head">
        <RichMenu
          trigger={
            <button
              type="button"
              aria-label="New"
              title="New"
              data-page-add=""
              className="nx-btn nx-btn-secondary page-add"
            >
              <FiPlus size={18} aria-hidden />
            </button>
          }
          items={[
            {
              art: "task",
              title: "New Task",
              sub: "Placed into a free hour",
              kbd: "N",
              onClick: newTask,
            },
            {
              art: "event",
              title: "New Event",
              sub: "Blocks time on your calendar",
              //todo: the event composer lives on the Calendar screen (S3).
              onClick: () => router.push("/calendar"),
            },
            {
              art: "doc",
              title: "New Doc",
              sub: "A page for anything",
              onClick: () => void newDoc(),
            },
          ]}
        />
        <div className="hd-titlebox">
          <h1 className="hd-title-h1">{dateLine}</h1>
          <span className="hd-meta-line hd-meta-t">Today · week {weekNo}</span>
        </div>
        <span className="hd-head-right">
          <span role="tablist" className="wk-tabs hd-tabs">
            {tabs.map(([id, label, n]) => (
              <button
                key={id}
                type="button"
                role="tab"
                data-hd-tab={id}
                className={`wk-tab wk-tabbtn${tab === id ? " is-on" : ""}`}
                onClick={() => setTab(id)}
                aria-selected={tab === id}
              >
                {label}
                {n ? <span className="hd-meta-t hd-num">{n}</span> : null}
              </button>
            ))}
          </span>
          {planButton(false, true)}
          <TaskViewGear scope="home" />
        </span>
      </header>

      <StScreen query={tasksQuery} screen="today" kind="list">
        <div ref={scrollRef} className="scroll-inner hd-scroll">
          {closedDay ? (
            <DayClosed
              count={day.length}
              mins={day.reduce((s, t) => s + (t.estimatedMinutes || 0), 0)}
              habits={habitsKept}
              lateN={lateOpen.length}
              onPlan={seeTomorrow}
              onUndo={undoLast}
            />
          ) : null}

          <div className="hd-cards" data-hd-cards="" data-hd-mode={tab}>
            {pick ? (
              <NextUpCard
                pick={pick}
                note={nextUpNote(pick, nowHour, today)}
                onOpen={open}
                onFocus={startFocus}
                onDone={() => check(pick.task)}
                onSkip={() =>
                  setSkipped((s) =>
                    skipNext(
                      s,
                      pick,
                      [...lateOpen, ...dayOpen].filter((t) => !s.includes(t.id))
                        .length
                    )
                  )
                }
              />
            ) : (
              <NextUpNone closed={closedDay} />
            )}
            <div key={tab} className="hd-side nx-swap" data-hd-side={tab}>
              {tab === "week" ? (
                <WeekStats
                  tasks={totals.tasks}
                  done={totals.done}
                  planned={totals.planned}
                  cap={totals.cap}
                  overdue={late.length}
                />
              ) : (
                <>
                  <ProgressCard
                    done={stats.done}
                    total={stats.total}
                    mins={stats.mins}
                    closed={closedDay}
                    empty={stats.total === 0}
                  />
                  <StreakCard n={streak.n} todayClosed={streak.todayClosed} />
                  <HabitsCard chips={chips} onToggle={onHabit} />
                </>
              )}
            </div>
          </div>

          <div className="hd-main" data-hd-mode={tab}>
            <div key={tab} className="hd-list nx-swap">
              {tab === "week" ? (
                week.map((w) => {
                  const list = w.tasks.filter(shown);
                  const openN = w.tasks.filter((t) => !t.done).length;
                  const doneN = w.tasks.length - openN;
                  return (
                    <Fold
                      key={w.date}
                      title={w.title}
                      count={openN}
                      open={!fold[`w${w.date}`]}
                      onToggle={flip(`w${w.date}`)}
                      action={
                        doneN ? (
                          <span className="hd-meta-t">{doneN} done</span>
                        ) : null
                      }
                    >
                      {w.events.map((e) => (
                        <div key={`e${e.id}`} className="hd-week-ev">
                          <span className="hd-week-ev-ico">
                            <EventIcon />
                          </span>
                          <span className="hd-week-ev-title">{e.title}</span>
                          <span className="hd-meta-t hd-num">
                            {e.startAt.slice(11, 16)} · {dur(e.len)}
                          </span>
                        </div>
                      ))}
                      <Capped list={list} render={(t) => row(t)} />
                      {!list.length && !w.events.length ? (
                        <span className="hd-week-none">
                          Nothing planned yet.
                        </span>
                      ) : null}
                    </Fold>
                  );
                })
              ) : (
                <>
                  {state === "empty" ? (
                    <EmptyDay onNew={newTask} plan={planButton()} />
                  ) : null}

                  {taskView.overdueFirst ? lateFold : null}

                  {sections.map(([name, list]) => (
                    <Fold
                      key={name}
                      title={name}
                      count={list.filter((t) => !t.done).length}
                      open={!fold[name]}
                      onToggle={flip(name)}
                      action={
                        <span className="hd-meta-t hd-num">
                          {dur(
                            list
                              .filter((t) => !t.done)
                              .reduce(
                                (s, t) => s + (t.estimatedMinutes || 0),
                                0
                              )
                          )}
                        </span>
                      }
                    >
                      <Capped list={list} render={(t) => row(t)} />
                    </Fold>
                  ))}

                  {taskView.overdueFirst ? null : lateFold}

                  {!closedDay && state !== "empty" ? (
                    <button
                      type="button"
                      className="hd-add hd-add-row"
                      onClick={newTask}
                    >
                      <span className="hd-add-box" />
                      Add a task
                    </button>
                  ) : null}

                  {doneToday.length ? (
                    <Fold
                      title="Done today"
                      count={doneToday.length}
                      open={!fold.done}
                      onToggle={flip("done")}
                    >
                      <Capped list={doneToday} render={(t) => row(t)} />
                    </Fold>
                  ) : null}
                  <NotesLine
                    has={dailyNote.exists}
                    busy={dailyNote.busy}
                    onOpen={() => void openNote()}
                  />
                </>
              )}
            </div>

            <aside
              className="hd-rail"
              aria-label={
                tab === "week" ? "The week at a glance" : "Today at a glance"
              }
            >
              {tab === "week" ? (
                <WeekLoad
                  days={week}
                  cap={cap}
                  pro={pro}
                  onCalendar={() => router.push("/calendar")}
                  onUpgrade={upgradeWeek}
                />
              ) : (
                <Schedule
                  items={sched}
                  nowHour={nowHour}
                  hueOf={hueOf}
                  evCount={sched.filter((x) => x.event).length}
                  onOpen={open}
                  onCalendar={() => router.push("/calendar")}
                />
              )}
              <InboxCard
                list={inboxShown.slice(0, 3)}
                total={inbox.length}
                phase={leaving}
                onCheck={(t) => checkById(t.id)}
                onOpen={open}
                onAll={() => router.push("/tasks")}
              />
            </aside>
          </div>
        </div>
      </StScreen>
    </div>
  );
}

const EventIcon = () => <FiCalendar size={13} aria-hidden />;

/**
 * The route's Home. The frame says which face to draw (`usePhoneUi`, read in
 * `HomeFaces`): the phone's day (phone/home) under 700 px, the desktop face
 * otherwise. The phone's state lives in `HomeFaces`, above the switch, so
 * crossing the width loses none of it.
 */
export function HomeScreen() {
  return <HomeFaces desktop={(ctl) => <DesktopHome ctl={ctl} />} />;
}
