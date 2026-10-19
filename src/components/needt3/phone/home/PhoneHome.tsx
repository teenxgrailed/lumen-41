"use client";

import { useEffect, useMemo, useRef } from "react";

import { useRouter } from "next/navigation";

import { LuCheck } from "react-icons/lu";

import { readPref } from "@/components/needt3/settings/derive";

import { addDays } from "@/lib/needt3/derive";
import { project } from "@/lib/needt3/derive";
import { highEnergyHours } from "@/lib/needt3/energy";
import { useSchedule } from "@/lib/needt3/hooks/account";
import { useAiAvailable } from "@/lib/needt3/hooks/ai-availability";
import { useDailyNote } from "@/lib/needt3/hooks/daily-note";
import { useEvents } from "@/lib/needt3/hooks/events";
import {
  useCheckins,
  useHabits,
  useToggleHabitToday,
} from "@/lib/needt3/hooks/habits";
import { useHighlight, useSetHighlight } from "@/lib/needt3/hooks/highlight";
import { usePersonalDay } from "@/lib/needt3/hooks/personal";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useSettings, useTimeZone } from "@/lib/needt3/hooks/settings";
import { useTaskView } from "@/lib/needt3/hooks/task-view";
import { useTasks, useUpdateTask } from "@/lib/needt3/hooks/tasks";
import { useWeather } from "@/lib/needt3/hooks/weather";
import { useWeekFocus } from "@/lib/needt3/hooks/week-focus";
import type { V3Task } from "@/lib/needt3/map";
import { todayLine } from "@/lib/needt3/today";
import { weekStartOf } from "@/lib/needt3/week-focus";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import { useStartFocus } from "../../focus/useFocusController";
import { EndDayNudge } from "../../home/EndDayNudge";
import { FinishPicks } from "../../home/FinishCard";
import { ReviewCard, ReviewSheet } from "../../home/ReviewSheet";
import { SampleBanner } from "../../home/SampleBanner";
import { ShutdownSheet } from "../../home/Shutdown";
import { StatsCard, StatsSheet } from "../../home/Stats";
import { briefFactsOf, doneTodayCount } from "../../home/brief";
import { firstEvent } from "../../home/day-line-model";
import {
  capacityFrom,
  dayStreak,
  proFromPlan,
  scheduleItems,
} from "../../home/derive";
import {
  finishHeadline,
  freeMinutesLeft,
  hourOfClock,
  pickFinishNext,
} from "../../home/finish";
import {
  HaBrief,
  HaHabits,
  HaHighlight,
  HaTimeLeft,
  HaWeather,
  haHabitsOf,
  haTaskCard,
  haTimeOf,
  haWeatherOf,
} from "../../home/ha";
import { useHaBrief } from "../../home/ha/useHaBrief";
import { highlightTask } from "../../home/highlight";
import { blockedMinutes, minutesAhead, timeLeft } from "../../home/timeleft";
import { useEndDayNudge } from "../../home/useEndDayNudge";
import { useFinishDay } from "../../home/useFinishDay";
import { useHighlightSuggest } from "../../home/useHighlightSuggest";
import { useHomeStats } from "../../home/useHomeStats";
import { useWeeklyReview } from "../../home/useWeeklyReview";
import { openPaywall } from "../../paywall/store";
import { PersonalDayBands } from "../../personal/PersonalBand";
import {
  StarterGameSlot,
  useStarterGameCard,
} from "../../starter-game/StarterGameSlot";
import {
  PkButton,
  PkEmpty,
  PkNumber,
  PkScreen,
  PkSection,
  PkTaskRow,
  pkDotSweep,
  pkReduced,
} from "../kit";
import { useTaskActions } from "../overlays/schedule";
import { snack } from "../overlays/snack";
import { usePhoneOverlays } from "../overlays/store";
import { usePhoneClock } from "./clock";
import { homeView, moveLate, nextUpWhy } from "./model";
import { CappedRows, PhoneState, hasContent } from "./parts";
import { useTaskPull } from "./pull";
import type { HomeController } from "./useHomeController";

const copy = strings["mobile-v2-plates.jsx"];
const none = () => undefined;

/**
 * HOME on the phone (mobile-v2-plates.jsx `V2pHome`). Help over report: the
 * date, a small progress line, the nearest task with its time and actions on a
 * sky plate, the rest of today as rows, habits folded, then tomorrow and
 * done. A finished day is one line ("All done for today") and See tomorrow.
 * Pull down at the top: search the tasks, Enter adds one to today.
 *
 * The data is the desktop Home's (`useTasks`, `useHabits`, …); the day's rules
 * are `lib/needt3/day.ts` through `homeView`.
 * "Notes for the day" is the desktop's line: it opens today's note, a
 * document in the person's pages (`useDailyNote`). The prototype keeps a plain
 * field in the browser; that would be a second copy of the day's notes.
 */
export function PhoneHome({ ctl }: { ctl: HomeController }) {
  const starter = useStarterGameCard();
  const { today, now, hour: nowHour } = usePhoneClock();
  const router = useRouter();
  const dailyNote = useDailyNote(today);
  const tz = useTimeZone();
  const weekStartDay = useSettings().data?.weekStartDay ?? "monday";
  const tasksQuery = useTasks();
  const projects = useProjects().data;
  const habitsQuery = useHabits();
  const checkinsQuery = useCheckins();
  const updateTask = useUpdateTask();
  const toggleHabit = useToggleHabitToday();
  const startFocus = useStartFocus();
  const openTask = usePhoneOverlays((s) => s.openTask);

  const {
    fold,
    setFold,
    flip,
    skipped,
    setSkipped,
    gone,
    exit: X,
    check,
  } = ctl;

  const all = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);

  const taskView = useTaskView();
  const stats = useHomeStats(all.filter((t) => t.done).length);
  const schedule = useSchedule();
  const energyHours = useMemo(
    () => highEnergyHours(schedule.data),
    [schedule.data]
  );
  const highlight = useHighlight(today);
  const setHighlight = useSetHighlight(today);
  const hlTask = highlightTask(all, highlight.data?.taskId);
  const lift = hlTask && !hlTask.done ? hlTask.id : null;
  const v = useMemo(
    () =>
      homeView(
        all.filter((t) => !gone[t.id]),
        today,
        {
          skipped,
          busy: { ...X.phase, ...gone },
          view: taskView,
          lift,
          energy: { nowHour, hours: energyHours },
        }
      ),
    [all, today, skipped, X.phase, gone, taskView, lift, nowHour, energyHours]
  );
  const { next: N } = v;
  const nu = N.nu;

  // A finished day: the best next tasks (not the one on the plate) and End day
  const prefs = useSettings().data?.prefs;
  const events = useEvents({ from: today, to: addDays(today, 1) });
  const finish = useFinishDay({ late: v.sec.late, day: v.sec.day, today });
  const openRest = {
    late: v.lateN,
    inbox: v.open(v.sec.inbox).length,
  };
  const review = useWeeklyReview({
    today,
    late: v.open(v.sec.late),
    day: v.sec.day,
    stats: stats.week,
  });
  const calendarItems = scheduleItems([], events.data ?? [], today);
  const personal = usePersonalDay(today);
  const workCap = capacityFrom(prefs);
  const left = timeLeft({
    capacity: freeMinutesLeft(workCap, today, nowHour, []),
    blocked: blockedMinutes(
      personal,
      Math.max(nowHour, hourOfClock(workCap.start)),
      hourOfClock(workCap.end)
    ),
    eventsAhead: minutesAhead(
      calendarItems.filter((x) => x.event),
      nowHour
    ),
    openTasks: v.open(v.sec.day),
  });
  const city = readPref(useSettings().data?.prefs, "city");
  const weather = useWeather(city);
  const wx = haWeatherOf({
    city,
    weather: weather.data,
    first: firstEvent(events.data ?? [], today, nowHour),
  });
  const nudge = useEndDayNudge({
    today,
    nowHour,
    hidden: v.dayClosed || finish.open,
  });
  const plan = usePlan();
  const pro = proFromPlan(plan.data?.kind);
  const aiAvailable = useAiAvailable();
  const briefFacts = briefFactsOf({
    late: v.open(v.sec.late),
    day: v.sec.day,
    freeMinutes: freeMinutesLeft(
      capacityFrom(prefs),
      today,
      nowHour,
      calendarItems
    ),
    schedule: calendarItems,
    nowHour,
  });
  const haBrief = useHaBrief({
    today,
    nowHour,
    doneToday: doneTodayCount(all, today),
    pro,
    aiAvailable: aiAvailable.data,
    facts: briefFacts,
  });
  const weekFocus = useWeekFocus(weekStartOf(today, weekStartDay));
  const suggest = useHighlightSuggest({
    tasks: all,
    today,
    nowHour,
    known: highlight.isFetched,
    hasHighlight: !!highlight.data,
    accept: (id) => void setHighlight.set(id),
    weekFocus: weekFocus.data?.focuses,
    ai: pro === true && aiAvailable.data === true,
  });
  const finishPicks = v.dayClosed
    ? pickFinishNext(
        all,
        today,
        freeMinutesLeft(
          capacityFrom(prefs),
          today,
          nowHour,
          scheduleItems([], events.data ?? [], today)
        )
      )
        .filter((p) => p.task.id !== nu?.id)
        .slice(0, 3)
    : [];

  const checkins = checkinsQuery.data ?? [];

  const tomorrowRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const seeTomorrow = () => {
    setFold((f) => ({ ...f, tomorrow: false }));
    raf.current = requestAnimationFrame(() =>
      tomorrowRef.current?.scrollIntoView({
        block: "start",
        behavior: pkReduced() ? "auto" : "smooth",
      })
    );
  };

  const moveToToday = () => {
    const r = moveLate(v.sec.late, today);
    if (!r) return;
    // each move stands alone: one that fails is rolled back and reported by
    // the mutation without taking the others' Undo with it
    void Promise.allSettled(
      r.moves.map((m) => updateTask.mutateAsync({ id: m.id, patch: m.patch }))
    ).then((settled) => {
      const done = settled.flatMap((s) =>
        s.status === "fulfilled" ? [s.value] : []
      );
      if (!done.length) return;
      snack(
        done.length === r.moves.length
          ? r.label
          : `${done.length} ${done.length === 1 ? "task" : "tasks"} moved to today`,
        () => Promise.allSettled(done.map((d) => d.undo()))
      );
    });
  };

  const pull = useTaskPull(all, today);

  const openNote = async () => {
    const id = await dailyNote.open();
    if (id) router.push(`/pages/${id}`);
  };

  const projOf = (t: V3Task) => {
    const p = project(t.projectId, projects ?? []);
    return p ? { name: p.name, color: p.color } : null;
  };
  const actionsOf = useTaskActions(X.exit);
  const row = (t: V3Task, o: { late?: boolean; tomorrow?: boolean } = {}) => (
    <PkTaskRow
      key={t.id}
      t={t}
      project={projOf(t)}
      late={!!o.late && !t.done}
      phase={X.phase[t.id]}
      out={!!X.out[t.id]}
      canDone={!t.done}
      canLater={!t.done && !o.tomorrow}
      actions={t.done ? undefined : actionsOf(t)}
      onCheck={check}
      onOpen={openTask}
      onSwipe={(side) => X.exit(t, side)}
    />
  );

  const ready = hasContent(tasksQuery);
  const sub = (t: V3Task, tail: string) =>
    [projOf(t)?.name, tail].filter(Boolean).join(" · ");
  const hlSub = sub;
  const restToday = Math.max(0, v.open(v.sec.day).length - 1);
  const nextSub =
    nu && N.lateOpen.includes(nu)
      ? nextUpWhy(N, today)
      : nu
        ? sub(nu, restToday ? `then ${restToday} more today` : "") ||
          nextUpWhy(N, today)
        : "";
  const dateLine = todayLine(now, tz, weekStartDay).line;

  /* Progress is a small part of the header; a finished day is one line. */
  const progress = !ready ? null : v.dayClosed ? (
    <div
      className="v2p-prog is-done"
      data-v2p-alldone={v.allDone ? "" : undefined}
      data-v2p-dayclosed=""
    >
      <p className="v2p-prog-line">
        <span className="v2p-prog-done">
          {v.allDone
            ? copy.V2pHome.all_done_for_today
            : finishHeadline(openRest).title}{" "}
          <LuCheck size={16} />
        </span>
      </p>
      <span className="v2p-prog-acts">
        <PkButton kind="quiet" onClick={finish.show} data-fin="end-day">
          End day
        </PkButton>
        {v.open(v.sec.next).length ? (
          <PkButton kind="ghost" onClick={seeTomorrow} data-v2p-see-tomorrow="">
            {copy.V2pHome.see_tomorrow}
          </PkButton>
        ) : null}
      </span>
    </div>
  ) : v.total ? (
    <div className="v2p-prog" data-v2p-count={`${v.done}/${v.total}`}>
      <p className="v2p-prog-line">
        <span className="v2p-prog-count">
          {`${copy.V2pHome.done} `}
          <PkNumber value={v.done} label={String(v.done)} />
          {` of ${v.total}`}
        </span>
        {v.lateN ? (
          <span className="v2p-prog-late">
            <span className="pk-alert-dot" />
            {v.lateN} overdue
          </span>
        ) : null}
      </p>
      <span className="v2p-prog-bar" aria-hidden="true">
        <span
          className="v2p-prog-fill"
          style={
            { "--p": (v.done / v.total).toFixed(3) } as React.CSSProperties
          }
        />
      </span>
    </div>
  ) : null;

  const haHabits = haHabitsOf(habitsQuery.data ?? [], checkins, today);
  const head =
    haHabits.length || progress ? (
      <>
        {haHabits.length ? (
          <div className="ha-phone">
            <HaHabits
              habits={haHabits}
              onToggle={(id, done) =>
                void toggleHabit.mutateAsync({ id, done }).catch(none)
              }
            />
          </div>
        ) : null}
        {progress}
      </>
    ) : null;

  return (
    <PkScreen
      screen="home"
      glyph="home"
      title={copy.V2pHome.today}
      sub={dateLine}
      head={head}
      onPull={ready ? pull : undefined}
    >
      <PhoneState query={tasksQuery} screen="today" />
      <SampleBanner />
      {ready && review.show ? (
        <ReviewCard phone onStart={review.start} onLater={review.later} />
      ) : null}
      {ready && nudge.show ? (
        <EndDayNudge phone onEndDay={finish.show} onDismiss={nudge.dismiss} />
      ) : null}
      {ready ? (
        <div className="ha-phone ha-ph-stack" data-ha-stack="">
          {hlTask && !hlTask.done ? (
            <HaHighlight
              phone
              state="set"
              card={haTaskCard(
                hlTask,
                today,
                hlSub(hlTask, "the one thing for today")
              )}
              onUnset={() => void setHighlight.set(null)}
              onStart={() => void startFocus(hlTask)}
              onDone={() => {
                pkDotSweep(`[data-ha-card="${hlTask.id}"]`, "row");
                check(hlTask);
              }}
              onOpen={() => openTask(hlTask)}
            />
          ) : suggest.pick ? (
            <HaHighlight
              phone
              state="suggest"
              card={haTaskCard(suggest.pick, today, suggest.reason)}
              index={suggest.index}
              count={suggest.count}
              locked={pro === false}
              onYes={suggest.accept}
              onAnother={suggest.another}
              onUpgrade={() => openPaywall("Highlight suggestions")}
            />
          ) : nu ? (
            <HaHighlight
              phone
              state="nextup"
              late={N.lateOpen.includes(nu)}
              card={haTaskCard(nu, today, nextSub)}
              onSkip={
                N.cands.length > 1
                  ? () => setSkipped(N.skip(skipped))
                  : undefined
              }
              onStart={() => void startFocus(nu)}
              onDone={() => {
                pkDotSweep(`[data-ha-card="${nu.id}"]`, "row");
                X.exit(nu, "check");
              }}
              onOpen={() => openTask(nu)}
            />
          ) : null}
          <HaBrief
            lines={haBrief.lines}
            note={haBrief.note}
            locked={haBrief.locked}
            onClose={haBrief.dismiss}
            onUpgrade={() => openPaywall("Morning brief")}
          />
          <HaWeather wx={wx} />
          <HaTimeLeft
            t={haTimeOf({
              left,
              nowHour,
              start: hourOfClock(workCap.start),
              end: hourOfClock(workCap.end),
            })}
          />
        </div>
      ) : null}

      {ready && finishPicks.length ? (
        <FinishPicks
          phone
          picks={finishPicks}
          onDoToday={(p) => void finish.doToday(p)}
        />
      ) : null}

      {ready ? <PersonalDayBands date={today} /> : null}

      {ready ? <StarterGameSlot screen="home" /> : null}
      {ready && v.empty && !starter.show && !starter.hold ? (
        <PkEmpty line={copy.V2pHome.a_clear_day_nothing_is_due_and_nothing_i} />
      ) : null}

      {ready ? (
        <div className="v2p-day">
          {v.lateRows.length ? (
            <PkSection
              title={copy.V2pHome.overdue}
              tone="late"
              count={v.lateRows.length}
              action={
                <PkButton kind="chip" onClick={moveToToday}>
                  {copy.V2pHome.move_to_today}
                </PkButton>
              }
            >
              <CappedRows
                list={v.lateRows}
                render={(t) => row(t, { late: true })}
              />
            </PkSection>
          ) : null}
          {v.parts.map(([p, list]) => (
            <PkSection key={p} title={p} count={list.length}>
              <CappedRows list={list} render={(t) => row(t)} />
            </PkSection>
          ))}
          {v.inboxRows.length ? (
            <PkSection
              title={copy.V2pHome.inbox}
              glyph="tasks"
              count={v.inboxRows.length}
            >
              <CappedRows list={v.inboxRows} render={(t) => row(t)} />
            </PkSection>
          ) : null}
          {v.tomorrowRows.length ? (
            <div ref={tomorrowRef} className="v2p-anchor">
              <PkSection
                title={copy.V2pHome.tomorrow}
                count={v.tomorrowRows.length}
                folded={fold.tomorrow}
                onFold={flip("tomorrow")}
              >
                <CappedRows
                  list={v.tomorrowRows}
                  render={(t) => row(t, { tomorrow: true })}
                />
              </PkSection>
            </div>
          ) : null}
          {v.doneToday.length ? (
            <PkSection
              title={copy.V2pHome.done_today}
              count={v.doneToday.length}
              folded={fold.done}
              onFold={flip("done")}
            >
              <CappedRows list={v.doneToday} render={(t) => row(t)} />
            </PkSection>
          ) : null}
          <StatsCard
            stats={stats.week}
            streak={dayStreak(all, today).n}
            onOpen={stats.show}
          />
          <button
            type="button"
            className="v2p-notes v2p-notes-btn"
            data-v2p-notes=""
            disabled={dailyNote.busy}
            onClick={() => void openNote()}
          >
            {dailyNote.exists
              ? "Open today\u2019s note"
              : copy.V2pNotes.notes_for_the_day}
          </button>
        </div>
      ) : null}
      <ShutdownSheet phone open={finish.open} {...finish.sheet} />
      <ReviewSheet phone open={review.open} {...review.sheet} />
      <StatsSheet
        phone
        open={stats.open}
        onClose={stats.close}
        {...stats.sheet}
      />
    </PkScreen>
  );
}
