"use client";

import { useEffect, useMemo, useRef } from "react";

import { useRouter } from "next/navigation";

import { LuCheck, LuTarget } from "react-icons/lu";

import { clock, durLabel } from "@/lib/needt3/day";
import { addDays } from "@/lib/needt3/derive";
import { project } from "@/lib/needt3/derive";
import { useAiAvailable } from "@/lib/needt3/hooks/ai-availability";
import { useDailyNote } from "@/lib/needt3/hooks/daily-note";
import { useEvents } from "@/lib/needt3/hooks/events";
import {
  useCheckins,
  useHabits,
  useToggleHabitToday,
} from "@/lib/needt3/hooks/habits";
import { useHighlight, useSetHighlight } from "@/lib/needt3/hooks/highlight";
import { useMorningBrief } from "@/lib/needt3/hooks/morning-brief";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useSettings, useTimeZone } from "@/lib/needt3/hooks/settings";
import { useTaskView } from "@/lib/needt3/hooks/task-view";
import { useTasks, useUpdateTask } from "@/lib/needt3/hooks/tasks";
import type { V3Task } from "@/lib/needt3/map";
import { todayLine } from "@/lib/needt3/today";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import { useStartFocus } from "../../focus/useFocusController";
import { BriefCard } from "../../home/BriefCard";
import { EndDayNudge } from "../../home/EndDayNudge";
import { FinishPicks } from "../../home/FinishCard";
import { HighlightCard } from "../../home/HighlightCard";
import { SampleBanner } from "../../home/SampleBanner";
import { ShutdownSheet } from "../../home/Shutdown";
import { StatsCard, StatsSheet } from "../../home/Stats";
import { briefFactsOf, isMorning, shouldAskBrief } from "../../home/brief";
import {
  capacityFrom,
  dayStreak,
  hourAt,
  proFromPlan,
  scheduleItems,
} from "../../home/derive";
import {
  finishHeadline,
  freeMinutesLeft,
  pickFinishNext,
} from "../../home/finish";
import { highlightMeta, highlightTask } from "../../home/highlight";
import { useEndDayNudge } from "../../home/useEndDayNudge";
import { useFinishDay } from "../../home/useFinishDay";
import { useHomeStats } from "../../home/useHomeStats";
import {
  PkButton,
  PkEmpty,
  PkNumber,
  PkScreen,
  PkSection,
  PkSkyBadge,
  PkSkyPlate,
  PkTaskRow,
  pkCx,
  pkDotSweep,
  pkReduced,
} from "../kit";
import { useTaskActions } from "../overlays/schedule";
import { snack } from "../overlays/snack";
import { usePhoneOverlays } from "../overlays/store";
import { HabitsStrip } from "./HabitsStrip";
import { usePhoneClock } from "./clock";
import { habitDots } from "./habits-row";
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
  const highlight = useHighlight(today);
  const setHighlight = useSetHighlight(today);
  const hlTask = highlightTask(all, highlight.data?.taskId);
  const lift = hlTask && !hlTask.done ? hlTask.id : null;
  const v = useMemo(
    () =>
      homeView(
        all.filter((t) => !gone[t.id]),
        today,
        { skipped, busy: { ...X.phase, ...gone }, view: taskView, lift }
      ),
    [all, today, skipped, X.phase, gone, taskView, lift]
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
  const nudge = useEndDayNudge({
    today,
    nowHour,
    hidden: v.dayClosed || finish.open,
  });
  const plan = usePlan();
  const pro = proFromPlan(plan.data?.kind);
  const aiAvailable = useAiAvailable();
  const morning = isMorning(nowHour);
  const calendarItems = scheduleItems([], events.data ?? [], today);
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
  const morningBrief = useMorningBrief({
    day: today,
    show: pro === true && morning,
    ask: shouldAskBrief({
      pro,
      morning,
      aiAvailable: aiAvailable.data,
      facts: briefFacts,
    }),
    facts: briefFacts,
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
  const nuAt = nu ? hourAt(nu, today) : null;
  const dateLine = todayLine(now, tz, weekStartDay).line;

  /* Progress is a small part of the header; a finished day is one line. */
  const progress = !ready ? null : v.dayClosed ? (
    <div
      className="v2p-prog is-done"
      data-v2p-alldone={v.allDone ? "" : undefined}
      data-v2p-dayclosed=""
    >
      <span className="v2p-prog-sky">
        <PkSkyBadge />
        <p className="v2p-prog-line">
          <span className="v2p-prog-done">
            {v.allDone
              ? copy.V2pHome.all_done_for_today
              : finishHeadline(openRest).title}{" "}
            <LuCheck size={16} />
          </span>
        </p>
      </span>
      <span className="v2p-prog-acts">
        <PkButton kind="chip" onClick={finish.show} data-fin="end-day">
          End day
        </PkButton>
        {v.open(v.sec.next).length ? (
          <PkButton kind="chip" onClick={seeTomorrow} data-v2p-see-tomorrow="">
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

  const dots = habitDots(
    habitsQuery.data ?? [],
    checkins,
    today,
    projects ?? []
  );
  const head =
    dots.length || progress ? (
      <>
        <HabitsStrip
          dots={dots}
          onTick={(id, done) =>
            void toggleHabit.mutateAsync({ id, done }).catch(none)
          }
        />
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
      {ready && nudge.show ? (
        <EndDayNudge phone onEndDay={finish.show} onDismiss={nudge.dismiss} />
      ) : null}
      {ready && morningBrief.brief ? (
        <BriefCard
          text={morningBrief.brief.text}
          onDismiss={morningBrief.dismiss}
        />
      ) : null}
      {ready && hlTask ? (
        <HighlightCard
          phone
          id={hlTask.id}
          title={hlTask.title}
          meta={highlightMeta(hlTask, today)}
          done={hlTask.done}
          onComplete={() => {
            pkDotSweep(`[data-hl-card="${hlTask.id}"]`, "row");
            check(hlTask);
          }}
          onFocus={() => void startFocus(hlTask)}
          onClear={() => void setHighlight.set(null)}
          onOpen={() => openTask(hlTask)}
        />
      ) : null}
      {ready && nu ? (
        <PkSkyPlate className="v2p-next" data-v2p-next={nu.id} key={nu.id}>
          <div className="v2p-next-top">
            <span
              className={pkCx(
                "v2p-next-label",
                N.lateOpen.includes(nu) && "is-late"
              )}
            >
              {N.lateOpen.includes(nu) ? (
                <span className="pk-alert-dot" />
              ) : null}
              {N.lateOpen.includes(nu)
                ? copy.V2pHome.overdue
                : copy.V2pHome.next_up}
            </span>
            {nuAt != null ? (
              <span className="v2p-next-time">{clock(nuAt)}</span>
            ) : null}
            {nu.estimatedMinutes ? (
              <span className="v2p-next-when">
                {durLabel(nu.estimatedMinutes)}
              </span>
            ) : null}
            {N.cands.length > 1 ? (
              <PkButton
                kind="ghost"
                className="v2p-next-skip"
                onClick={() => setSkipped(N.skip(skipped))}
                data-v2p-skip=""
              >
                {copy.V2pHome.skip}
              </PkButton>
            ) : null}
          </div>
          <button
            type="button"
            className="v2p-next-title"
            onClick={() => openTask(nu)}
          >
            {nu.title}
          </button>
          <p className="v2p-next-why">{nextUpWhy(N, today)}</p>
          <div className="v2p-next-actions">
            <PkButton
              kind="primary"
              small
              icon={<LuTarget size={16} />}
              onClick={() => void startFocus(nu)}
            >
              {copy.V2pHome.start_focus}
            </PkButton>
            <PkButton
              small
              icon={<LuCheck size={16} />}
              onClick={() => {
                pkDotSweep(`[data-v2p-next="${nu.id}"]`, "row");
                X.exit(nu, "check");
              }}
              data-v2p-next-done=""
            >
              {copy.V2pHome.done}
            </PkButton>
          </div>
        </PkSkyPlate>
      ) : null}

      {ready && finishPicks.length ? (
        <FinishPicks
          phone
          picks={finishPicks}
          onDoToday={(p) => void finish.doToday(p)}
        />
      ) : null}

      {ready && v.empty ? (
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
      <StatsSheet
        phone
        open={stats.open}
        onClose={stats.close}
        {...stats.sheet}
      />
    </PkScreen>
  );
}
