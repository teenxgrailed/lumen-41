"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { readPref } from "@/components/needt3/settings/derive";

import { clock } from "@/lib/needt3/day";
import { planIsShown } from "@/lib/needt3/day-plan";
import { dayHeader, freeAfterHour } from "@/lib/needt3/day-plan-view";
import { addDays } from "@/lib/needt3/derive";
import { project } from "@/lib/needt3/derive";
import { highEnergyHours } from "@/lib/needt3/energy";
import { useSchedule } from "@/lib/needt3/hooks/account";
import { useAiAvailable } from "@/lib/needt3/hooks/ai-availability";
import { useDailyNote } from "@/lib/needt3/hooks/daily-note";
import {
  useDayPlanToday,
  useRestoreSomeday,
  useSomeday,
} from "@/lib/needt3/hooks/day-plan";
import { useEvents } from "@/lib/needt3/hooks/events";
import {
  useAdvanceReview,
  useFirstReplanHints,
} from "@/lib/needt3/hooks/first-replan";
import {
  useCheckins,
  useHabits,
  useToggleHabitToday,
} from "@/lib/needt3/hooks/habits";
import { useHighlight, useSetHighlight } from "@/lib/needt3/hooks/highlight";
import { useHomeBlocks } from "@/lib/needt3/hooks/home-blocks";
import { useFillFreeTime } from "@/lib/needt3/hooks/nudges";
import { usePersonalDay } from "@/lib/needt3/hooks/personal";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useSettings, useTimeZone } from "@/lib/needt3/hooks/settings";
import { useStreak } from "@/lib/needt3/hooks/streak";
import { useTaskView } from "@/lib/needt3/hooks/task-view";
import { useTasks, useUpdateTask } from "@/lib/needt3/hooks/tasks";
import { useWeather } from "@/lib/needt3/hooks/weather";
import { useWeekFocus } from "@/lib/needt3/hooks/week-focus";
import type { V3Task } from "@/lib/needt3/map";
import { projectColor } from "@/lib/needt3/project-color";
import { todayLine } from "@/lib/needt3/today";
import { weekStartOf } from "@/lib/needt3/week-focus";
import type { DayBand } from "@/lib/personal-time-days";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import { useStartFocus } from "../../focus/useFocusController";
import { EndDayNudge } from "../../home/EndDayNudge";
import { FirstReplanCard } from "../../home/FirstReplanCard";
import {
  DayCount,
  MissedLine,
  OverdueRow,
  RESCHEDULE_NOTICE,
  reviewHour,
} from "../../home/HomeV2";
import { OnboardingResumeBanner } from "../../home/OnboardingResumeBanner";
import { ReviewCard } from "../../home/ReviewCard";
import { SampleBanner } from "../../home/SampleBanner";
import { StatsCard, StatsSheet } from "../../home/Stats";
import { briefFactsOf, doneTodayCount } from "../../home/brief";
import { firstEvent } from "../../home/day-line-model";
import {
  capacityFrom,
  chronological,
  dayStreak,
  dur,
  proFromPlan,
  scheduleItems,
} from "../../home/derive";
import {
  freeMinutesLeft,
  hourOfClock,
  pickFinishNext,
} from "../../home/finish";
import {
  HaAllDone,
  HaBand,
  HaBrief,
  HaEndDaySheet,
  HaHabits,
  HaHighlight,
  HaReviewSheet,
  HaStreak,
  HaTimeLeft,
  HaWeather,
  haAllDoneOf,
  haBandOf,
  haHabitsOf,
  haTaskCard,
  haTimeOf,
  haWeatherOf,
} from "../../home/ha";
import { useHaBrief } from "../../home/ha/useHaBrief";
import { highlightTask } from "../../home/highlight";
import {
  hhmm,
  missedToday,
  nowCardTime,
  nowKicker,
  pickNow,
} from "../../home/now";
import {
  anytimeOpen,
  lateActions,
  lateMovable,
  spreadLeads,
} from "../../home/spread";
import { blockedMinutes, minutesAhead, timeLeft } from "../../home/timeleft";
import { useEndDayNudge } from "../../home/useEndDayNudge";
import { useFinishDay } from "../../home/useFinishDay";
import { useHighlightSuggest } from "../../home/useHighlightSuggest";
import { useHomeStats } from "../../home/useHomeStats";
import { useSpread } from "../../home/useSpread";
import { useWeeklyReview } from "../../home/useWeeklyReview";
import { openPaywall } from "../../paywall/store";
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
import { PersonalBandSheet } from "../overlays/PersonalBandSheet";
import { useTaskActions } from "../overlays/schedule";
import { snack } from "../overlays/snack";
import { usePhoneOverlays } from "../overlays/store";
import { PlanCloseSheet } from "./PlanCloseSheet";
import { PlanDate, PlanHello, PlanToday, PlanWeekday } from "./PlanToday";
import { SomedaySheet } from "./SomedaySheet";
import { TaskGlyph } from "./TaskGlyph";
import { usePhoneClock } from "./clock";
import { homeView, moveLate, nextUpWhy } from "./model";
import { CappedRows, PhoneState, hasContent } from "./parts";
import { useCloseFlow } from "./useCloseFlow";
import type { HomeController } from "./useHomeController";

const copy = strings["mobile-v2-plates.jsx"];
const none = () => undefined;
/** A spread's answer as the phone says things: one snack, its Undo. */
const sayOnPhone = (
  headline: string,
  _detail?: string,
  undo?: () => Promise<unknown>
) => void snack(headline, undo);

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
export function PhoneHome({
  ctl,
  v2 = false,
}: {
  ctl: HomeController;
  /** Home v2 (flag `home_v2`): Now, the day, one overdue row. */
  v2?: boolean;
}) {
  const starter = useStarterGameCard();
  const { today, now, hour: nowHour } = usePhoneClock();
  const router = useRouter();
  const dailyNote = useDailyNote(today);
  const tz = useTimeZone();
  const blocks = useHomeBlocks();
  const weekStartDay = useSettings().data?.weekStartDay ?? "monday";
  const tasksQuery = useTasks();
  const projects = useProjects().data;
  const habitsQuery = useHabits();
  const checkinsQuery = useCheckins();
  const updateTask = useUpdateTask();
  const toggleHabit = useToggleHabitToday();
  const startFocus = useStartFocus();
  const fillFreeTime = useFillFreeTime(RESCHEDULE_NOTICE);
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
  const streak = useStreak(all.filter((t) => t.done).length);
  const schedule = useSchedule();
  const energyHours = useMemo(
    () => highEnergyHours(schedule.data),
    [schedule.data]
  );
  // One hint at a time: the first-replan card is answered before the
  // suggested highlight shows up.
  const hint = useFirstReplanHints().current;
  const firstReplanHold = hint !== null;
  const highlight = useHighlight(today);
  const setHighlight = useSetHighlight(today);
  const hlTask = highlightTask(all, highlight.data?.taskId);
  const lift = !v2 && hlTask && !hlTask.done ? hlTask.id : null;
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
          plate: !v2,
          energy: { nowHour, hours: energyHours },
        }
      ),
    [
      all,
      today,
      skipped,
      X.phase,
      gone,
      taskView,
      lift,
      v2,
      nowHour,
      energyHours,
    ]
  );
  const { next: N } = v;
  const nu = N.nu;

  // A finished day: the best next tasks (not the one on the plate) and End day
  const prefs = useSettings().data?.prefs;
  const events = useEvents({ from: today, to: addDays(today, 1) });
  const finish = useFinishDay({ late: v.sec.late, day: v.sec.day, today });
  // The day plan (flag day_plan): with a plan for today, Today is drawn from
  // it and the evening End day closes it. Off or none: the old Today.
  const dayPlan = useDayPlanToday(today);
  const planOn = planIsShown(dayPlan.snapshot);
  const planOpen = planOn && dayPlan.snapshot?.plan?.status !== "closed";
  const planIds = useMemo(
    () => new Set(dayPlan.snapshot?.plan?.items.map((i) => i.taskId) ?? []),
    [dayPlan.snapshot]
  );
  const [fullList, setFullList] = useState(false);
  const [somedayOpen, setSomedayOpen] = useState(false);
  const someday = useSomeday(somedayOpen);
  const returning = useRestoreSomeday();
  const closeFlow = useCloseFlow({
    today,
    snapshot: dayPlan.snapshot,
    fallback: finish.show,
  });
  const endDay = planOpen ? closeFlow.show : finish.show;
  const openRest = {
    late: v.lateN,
    inbox: v.open(v.sec.inbox).length,
  };
  const review = useWeeklyReview({
    today,
    late: v.open(v.sec.late),
    day: v.sec.day,
    stats: stats.week,
    tasks: all,
    projects: projects ?? [],
    streak: dayStreak(all, today).n,
  });
  // v2: the Sunday review waits for the evening (from 18:00 local); until
  // then it counts as not shown, so the first-replan hints do not wait on it.
  const reviewShown = review.show && (!v2 || reviewHour(nowHour));
  useAdvanceReview(reviewShown, true);
  const calendarItems = scheduleItems([], events.data ?? [], today);
  const personal = usePersonalDay(today);
  const [band, setBand] = useState<DayBand | null>(null);
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
  // Overbooked: Spread gives today's untimed tasks (and, from Overdue, the
  // late ones) the next days with room; the snack's Undo puts them back.
  const spreader = useSpread(sayOnPhone);
  const spreadAnytime = anytimeOpen(v.open(v.sec.day), today)
    .filter((t) => t.id !== lift)
    .map((t) => t.id);
  const spreadLate = lateMovable(v.open(v.sec.late)).map((t) => t.id);
  const spreadFirst = spreadLeads(!!left?.over, spreadLate.length);
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
    hidden: v.dayClosed || finish.open || closeFlow.open,
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
    // v2 draws no highlight card, so no suggestion is asked for (an AI action)
    known: highlight.isFetched && !v2,
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

  const openNote = async () => {
    const id = await dailyNote.open();
    if (id) router.push(`/pages/${id}`);
  };

  const projOf = (t: V3Task) => {
    const p = project(t.projectId, projects ?? []);
    return p ? { name: p.name, color: projectColor(p.id, p.color) } : null;
  };
  const actionsOf = useTaskActions(X.exit);
  /** A task's own colour and icon for the textured Next plate. */
  const plateOf = (t: V3Task) => ({
    hue: projOf(t)?.color ?? null,
    mark: <TaskGlyph title={t.title} icon={t.icon} size={22} />,
  });
  const row = (
    t: V3Task,
    o: {
      late?: boolean;
      tomorrow?: boolean;
      icon?: React.ReactNode;
      size?: "big" | "compact";
    } = {}
  ) => (
    <PkTaskRow
      key={t.id}
      t={t}
      icon={o.icon}
      size={o.size}
      project={projOf(t)}
      late={!!o.late && !t.done}
      phase={X.phase[t.id]}
      out={!!X.out[t.id]}
      hideDue={v2 && !o.late && !o.tomorrow && t.dueDate === today}
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
  const lateActs = (
    <span className="v2p-late-acts">
      {spreadLate.length ? (
        <PkButton
          kind={spreadFirst ? "chip" : "ghost"}
          disabled={spreader.busy}
          onClick={() => void spreader.spread(spreadLate)}
        >
          Spread
        </PkButton>
      ) : null}
      <PkButton kind={spreadFirst ? "ghost" : "chip"} onClick={moveToToday}>
        {copy.V2pHome.move_to_today}
      </PkButton>
    </span>
  );
  const aux = (
    <>
      {reviewShown && (hint === null || hint === "review") ? (
        <ReviewCard phone onStart={review.start} onLater={review.later} />
      ) : null}
      {nudge.show && !firstReplanHold ? (
        <EndDayNudge phone onEndDay={endDay} onDismiss={nudge.dismiss} />
      ) : null}
    </>
  );
  // HOME V2: one Now card, picked by `pickNow` (the desktop's rule).
  const dayOpenNow = v.open(v.sec.day);
  // Today's tasks whose hour passed: one line, not rows that hang silently.
  const nowPick = v2
    ? pickNow({
        schedule: scheduleItems(
          v.sec.day.filter((t) => !t.noSlot),
          events.data ?? [],
          today
        ),
        dayOpen: dayOpenNow,
        nowHour,
        today,
        skipped,
        // a highlight just ticked keeps the card while its strike plays
        highlight: hlTask
          ? hlTask.done &&
            (X.phase[hlTask.id] === "check" || X.phase[hlTask.id] === "done")
            ? { ...hlTask, done: false }
            : hlTask
          : null,
      })
    : null;
  const nowTask = nowPick?.task ?? null;
  const missed = v2
    ? missedToday(dayOpenNow, today, nowHour).filter(
        (t) => t.id !== nowTask?.id
      )
    : [];
  // v2: the task on the Now card is not repeated in the rows. Only that one
  // (not the old overdue-first pick) leaves them.
  // Only the task whose card is actually drawn leaves them: not on a closed
  // day, not while a first-replan hint holds the card back, not with the
  // Next-up block switched off.
  const shownNow =
    v2 && ready && !v.dayClosed && blocks.nextUp && !firstReplanHold
      ? nowTask
      : null;
  const hide = (l: readonly V3Task[]) =>
    shownNow ? l.filter((t) => t.id !== shownNow.id) : l;
  // With the plan drawn, its tasks are not repeated in the day's lists and the
  // overdue and Inbox lists wait behind "All tasks".
  const hidePlan = (l: readonly V3Task[]) =>
    planOn ? l.filter((t) => !planIds.has(t.id)) : l;
  const folded = planOn && !fullList;
  const lateRows = v2 ? hide(v.lateRows) : v.lateRows;
  const inboxRows = v2 ? hide(v.inboxRows) : v.inboxRows;
  const dayParts =
    v2 || planOn
      ? v.parts
          .map(
            ([p, l]) => [p, hidePlan(v2 ? hide(l) : l)] as [string, V3Task[]]
          )
          .filter(([, l]) => l.length)
      : v.parts;
  const taskById = new Map(all.map((t) => [t.id, t] as const));
  const chrono = chronological(dayParts);
  const nowNode = !nowPick ? null : nowPick.event ? (
    <HaHighlight
      hue={null}
      phone
      state="nextup"
      kicker={nowKicker(nowPick)}
      card={{
        id: nowPick.event.key,
        title: nowPick.event.title,
        // the kicker already says "Next \u00b7 13:00"
        ...(nowPick.kind === "now" ? { time: hhmm(nowPick.event.at) } : {}),
        dur: dur(nowPick.event.len),
        sub: "On your calendar",
      }}
      onSkip={
        nowPick.canSkip
          ? () =>
              setSkipped(
                nowPick.wrapped
                  ? [nowPick.skipKey]
                  : [...skipped, nowPick.skipKey]
              )
          : undefined
      }
      actions={
        <button
          type="button"
          className="ha-btn is-primary is-lg"
          data-hv2-open-calendar=""
          onClick={() => router.push("/calendar")}
        >
          Open calendar
        </button>
      }
    />
  ) : nowTask ? (
    <HaHighlight
      {...plateOf(nowTask)}
      phone
      state="nextup"
      kicker={nowKicker(nowPick)}
      card={nowCardTime(
        haTaskCard(
          nowTask,
          today,
          sub(
            nowTask,
            nowPick.kind === "highlight"
              ? "the one thing for today"
              : dayOpenNow.length > 1
                ? `then ${dayOpenNow.length - 1} more today`
                : ""
          )
        ),
        nowPick.kind
      )}
      onSkip={
        nowPick.canSkip
          ? () =>
              setSkipped(
                nowPick.wrapped
                  ? [nowPick.skipKey]
                  : [...skipped, nowPick.skipKey]
              )
          : undefined
      }
      onStart={() => void startFocus(nowTask)}
      onDone={() => {
        pkDotSweep(`[data-ha-card="${nowTask.id}"]`, "row");
        X.exit(nowTask, "check");
      }}
      onOpen={() => openTask(nowTask)}
    />
  ) : null;

  /* Progress is a small part of the header; a finished day is one line. */
  const progress =
    v2 || !ready || v.dayClosed ? null : v.total ? (
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

  const haHabits = haHabitsOf(
    habitsQuery.data ?? [],
    checkins,
    today,
    projects ?? []
  );
  const showHabits = !v2 && blocks.habits && haHabits.length > 0;
  // The day plan's header: the weekday big with a dot, the date at the right,
  // then the greeting sentence and the stats line, filled from data.
  const planShown = ready && planOn && !!dayPlan.snapshot?.plan;
  const dayMeetings = calendarItems.filter((x) => x.event);
  const free = freeAfterHour(dayMeetings, nowHour, hourOfClock(workCap.end));
  const planHead = planShown ? (
    <PlanHello
      plan={dayPlan.snapshot!.plan!}
      hour={nowHour}
      meetings={dayMeetings.length}
      habits={haHabits.length}
      freeAfter={free == null ? null : clock(free)}
    />
  ) : null;
  const head =
    showHabits || progress || planHead ? (
      <>
        {planHead}
        {showHabits ? (
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
  const hdr = planShown ? dayHeader(now, tz) : null;
  // Overdue work sits behind "All tasks" while the plan is drawn: its two
  // actions stay one tap away under the plan.
  const lateAct = lateActions(v.sec.late, !!left?.over);
  const planLate = lateAct
    ? {
        count: lateAct.count,
        spreadFirst: lateAct.spreadFirst,
        canSpread: lateAct.spreadIds.length > 0,
        busy: spreader.busy,
        onSpread: () => void spreader.spread(lateAct.spreadIds),
        onMove: moveToToday,
      }
    : null;

  return (
    <PkScreen
      screen="home"
      className={hdr ? "dp-screen" : undefined}
      title={hdr ? <PlanWeekday weekday={hdr.weekday} /> : copy.V2pHome.today}
      right={hdr ? <PlanDate date={hdr.date} year={hdr.year} /> : undefined}
      sub={
        hdr ? undefined : v2 && ready && !v.dayClosed ? (
          <span className="hv2-sub">
            {dateLine}
            <DayCount done={v.done} total={v.total} />
          </span>
        ) : (
          dateLine
        )
      }
      head={head}
    >
      <PhoneState query={tasksQuery} screen="today" />
      <OnboardingResumeBanner />
      <SampleBanner />
      <FirstReplanCard />
      {ready && !v2 ? aux : null}
      {ready && planOn && dayPlan.snapshot ? (
        <PlanToday
          snapshot={dayPlan.snapshot}
          byId={taskById}
          row={(t, o) => row(t, o)}
          allCount={lateRows.length + inboxRows.length}
          allOpen={fullList}
          onAll={() => setFullList((o) => !o)}
          onSomeday={() => setSomedayOpen(true)}
          late={planLate}
        />
      ) : null}
      {ready ? (
        <div className="ha-phone ha-ph-stack" data-ha-stack="">
          {v.dayClosed ? (
            <HaAllDone
              {...haAllDoneOf({
                count: v.sec.day.length,
                focusMinutes: stats.week?.days.find((d) => d.date === today)
                  ?.focusMinutes,
                open: openRest,
                picks: finishPicks,
                freeMinutes: freeMinutesLeft(
                  workCap,
                  today,
                  nowHour,
                  calendarItems
                ),
              })}
              onEndDay={endDay}
              onSeeTomorrow={
                v.open(v.sec.next).length ? seeTomorrow : undefined
              }
            />
          ) : !blocks.nextUp || firstReplanHold ? null : v2 ? (
            nowNode
          ) : hlTask && !hlTask.done ? (
            <HaHighlight
              {...plateOf(hlTask)}
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
              {...plateOf(suggest.pick)}
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
              {...plateOf(nu)}
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
          {v2 && !firstReplanHold && missed.length ? (
            <MissedLine
              count={missed.length}
              onReschedule={() => fillFreeTime()}
            />
          ) : null}
          {v2 ? aux : null}
          <HaBrief
            lines={haBrief.lines}
            note={haBrief.note}
            locked={haBrief.locked}
            onClose={haBrief.dismiss}
            onUpgrade={() => openPaywall("Morning brief")}
          />
          {blocks.weather ? <HaWeather wx={wx} /> : null}
          {blocks.todayBar ? (
            <HaTimeLeft
              t={haTimeOf({
                left,
                nowHour,
                start: hourOfClock(workCap.start),
                end: hourOfClock(workCap.end),
              })}
              onSpread={
                spreadAnytime.length
                  ? () => void spreader.spread(spreadAnytime)
                  : undefined
              }
              spreadBusy={spreader.busy}
            />
          ) : null}
          <HaStreak streak={streak.data} />
        </div>
      ) : null}

      {ready && personal.length ? (
        <div className="ha-phone ha-ph-stack ha-ph-bands" data-ha-bands="">
          {personal.map((b) => (
            <HaBand key={b.key} b={haBandOf(b)} onOpen={(x) => setBand(x)} />
          ))}
        </div>
      ) : null}

      {ready ? <StarterGameSlot screen="home" /> : null}
      {ready && v.empty && !starter.show && !starter.hold ? (
        <PkEmpty line={copy.V2pHome.a_clear_day_nothing_is_due_and_nothing_i} />
      ) : null}
      {ready ? (
        <div className="v2p-day">
          {!v2 && !folded && v.lateRows.length ? (
            <PkSection
              title={copy.V2pHome.overdue}
              tone="late"
              count={v.lateRows.length}
              action={lateActs}
            >
              <CappedRows
                list={v.lateRows}
                render={(t) => row(t, { late: true })}
              />
            </PkSection>
          ) : null}
          {v2 ? (
            <>
              {chrono.timed.length ? (
                <div className="hv2-list" data-hv2-list="">
                  <CappedRows list={chrono.timed} render={(t) => row(t)} />
                </div>
              ) : null}
              {chrono.anytime.length ? (
                <PkSection
                  title="Anytime"
                  count={chrono.anytime.length}
                  folded={fold.anytimeOpen !== true}
                  onFold={flip("anytimeOpen")}
                >
                  <CappedRows list={chrono.anytime} render={(t) => row(t)} />
                </PkSection>
              ) : null}
            </>
          ) : (
            dayParts.map(([p, list]) => (
              <PkSection key={p} title={p} count={list.length}>
                <CappedRows list={list} render={(t) => row(t)} />
              </PkSection>
            ))
          )}
          {v2 && !folded && lateRows.length ? (
            <OverdueRow count={lateRows.length} actions={lateActs}>
              <CappedRows
                list={lateRows}
                render={(t) => row(t, { late: true })}
              />
            </OverdueRow>
          ) : null}
          {!folded && inboxRows.length ? (
            <PkSection
              title={copy.V2pHome.inbox}
              glyph="tasks"
              count={inboxRows.length}
            >
              <CappedRows list={inboxRows} render={(t) => row(t)} />
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
          {v2 ? null : (
            <>
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
            </>
          )}
        </div>
      ) : null}
      <HaEndDaySheet phone open={finish.open} {...finish.sheet} />
      <PlanCloseSheet {...closeFlow.sheet} />
      <SomedaySheet
        open={somedayOpen}
        items={someday.data?.items ?? []}
        loading={someday.isLoading}
        busy={returning.busy}
        onReturn={(id) => void returning.restore([id])}
        onClose={() => setSomedayOpen(false)}
      />
      <HaReviewSheet phone open={review.open} {...review.sheet} />
      <StatsSheet
        phone
        open={stats.open}
        onClose={stats.close}
        {...stats.sheet}
      />
      <PersonalBandSheet band={band} onClose={() => setBand(null)} />
    </PkScreen>
  );
}
