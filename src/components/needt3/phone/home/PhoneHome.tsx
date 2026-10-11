"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { LuCheck, LuTarget } from "react-icons/lu";

import { formatInTimeZone } from "@/lib/date-utils";
import { clock, durLabel, laterPatch, moveOverdue } from "@/lib/needt3/day";
import {
  habitColor,
  habitDoneOn,
  at as hourAt,
  liveHabits,
} from "@/lib/needt3/derive";
import { project } from "@/lib/needt3/derive";
import {
  useCheckins,
  useHabits,
  useToggleHabitToday,
} from "@/lib/needt3/hooks/habits";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import {
  useTasks,
  useToggleTask,
  useUpdateTask,
} from "@/lib/needt3/hooks/tasks";
import type { V3Habit, V3Task } from "@/lib/needt3/map";

import { useNeedt3Ui } from "@/store/needt3-ui";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
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
  usePkExit,
} from "../kit";
import { snack } from "../overlays/snack";
import { usePhoneOverlays } from "../overlays/store";
import { usePhoneClock } from "./clock";
import { homeView, nextUpWhy } from "./model";
import { CappedRows, PhoneState, hasContent } from "./parts";
import { useTaskPull } from "./pull";

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
 * //todo: "Notes for the day" is not drawn. The prototype keeps it in the
 * browser; the account's daily note is a rich document (`/api/daily-agenda`,
 * the desktop Home leaves it as a //todo too), and a plain field here would
 * overwrite it.
 */
export function PhoneHome() {
  const { today, now } = usePhoneClock();
  const tz = useTimeZone();
  const tasksQuery = useTasks();
  const projects = useProjects().data;
  const habitsQuery = useHabits();
  const checkinsQuery = useCheckins();
  const toggleTask = useToggleTask();
  const updateTask = useUpdateTask();
  const toggleHabit = useToggleHabitToday();
  const setFocusOpen = useNeedt3Ui((s) => s.setFocusOpen);
  const openTask = usePhoneOverlays((s) => s.openTask);

  const [fold, setFold] = useState({
    tomorrow: true,
    done: true,
    habits: true,
  });
  const flip = (k: keyof typeof fold) => () =>
    setFold((f) => ({ ...f, [k]: !f[k] }));
  const [skipped, setSkipped] = useState<string[]>([]);
  // Ids whose write is in flight after the row has left: they stay out of the
  // lists until the optimistic change lands, so a row never blinks back.
  const [gone, setGone] = useState<Record<string, 1>>({});
  const hide = (id: string, on: boolean) =>
    setGone((m) => {
      if (on) return { ...m, [id]: 1 };
      const n = { ...m };
      delete n[id];
      return n;
    });

  const all = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);

  const X = usePkExit<V3Task>((t, kind) => {
    hide(t.id, true);
    const run =
      kind === "later"
        ? updateTask
            .mutateAsync({ id: t.id, patch: laterPatch(t, today) })
            .then(({ undo }) => snack(copy.X.moved_to_tomorrow, undo))
        : toggleTask.toggle(t);
    void run.catch(none).finally(() => hide(t.id, false));
  });

  const v = useMemo(
    () =>
      homeView(
        all.filter((t) => !gone[t.id]),
        today,
        { skipped, busy: { ...X.phase, ...gone } }
      ),
    [all, today, skipped, X.phase, gone]
  );
  const { next: N } = v;
  const nu = N.nu;

  const habits = liveHabits(habitsQuery.data ?? []);
  const checkins = checkinsQuery.data ?? [];
  const habitsDone = habits.filter((h) =>
    habitDoneOn(h.id, today, checkins)
  ).length;

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
    const r = moveOverdue(all, today);
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

  const projOf = (t: V3Task) => {
    const p = project(t.projectId, projects ?? []);
    return p ? { name: p.name, color: p.color } : null;
  };
  const check = (t: V3Task) => {
    if (t.done) void toggleTask.toggle(t).catch(none);
    else X.exit(t, "check");
  };
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
      onCheck={check}
      onOpen={openTask}
      onSwipe={(side) => X.exit(t, side)}
    />
  );

  const ready = hasContent(tasksQuery);
  const nuAt = nu ? hourAt(nu) : null;
  const d = formatInTimeZone(now, tz, "EEEE, d MMMM");
  const week = formatInTimeZone(now, tz, "I");

  /* Progress is a small part of the header; a finished day is one line. */
  const head = !ready ? null : v.allDone ? (
    <div className="v2p-prog is-done" data-v2p-alldone="">
      <span className="v2p-prog-sky">
        <PkSkyBadge />
        <p className="v2p-prog-line">
          <span className="v2p-prog-done">
            {copy.V2pHome.all_done_for_today} <LuCheck size={16} />
          </span>
        </p>
      </span>
      {v.open(v.sec.next).length ? (
        <PkButton kind="chip" onClick={seeTomorrow} data-v2p-see-tomorrow="">
          {copy.V2pHome.see_tomorrow}
        </PkButton>
      ) : null}
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

  return (
    <PkScreen
      screen="home"
      glyph="home"
      title={copy.V2pHome.today}
      sub={`${d} · week ${week}`}
      head={head}
      onPull={ready ? pull : undefined}
    >
      <PhoneState query={tasksQuery} screen="today" />
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
          <p className="v2p-next-why">{nextUpWhy(N)}</p>
          <div className="v2p-next-actions">
            <PkButton
              kind="primary"
              small
              icon={<LuTarget size={16} />}
              //todo: start a FocusSession (taskId, 25 min) through
              // /api/focus/session; for now the Focus window opens on its own
              // setup, as on the desktop Home, and nothing claims a session began.
              onClick={() => setFocusOpen(true)}
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
          {habits.length ? (
            <PkSection
              className="v2p-habits"
              glyph="habits"
              title={copy.V2pHome.habits}
              count={`${habitsDone} of ${habits.length}`}
              folded={fold.habits}
              onFold={flip("habits")}
            >
              {habits.map((h) => (
                <HabitRow
                  key={h.id}
                  habit={h}
                  on={habitDoneOn(h.id, today, checkins)}
                  hue={habitColor(h, projects ?? []) ?? "var(--v2p-lav)"}
                  onToggle={(done) =>
                    void toggleHabit.mutateAsync({ id: h.id, done }).catch(none)
                  }
                />
              ))}
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
        </div>
      ) : null}
    </PkScreen>
  );
}

function HabitRow({
  habit,
  on,
  hue,
  onToggle,
}: {
  habit: V3Habit;
  on: boolean;
  hue: string;
  onToggle: (done: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={pkCx("v2p-hab", on && "is-on")}
      style={{ "--hue": hue } as React.CSSProperties}
      aria-pressed={on}
      onClick={() => onToggle(!on)}
      data-v2p-habit={habit.id}
    >
      <span className="v2p-hab-mark" aria-hidden="true">
        {on ? <LuCheck size={12} /> : null}
      </span>
      <span className="v2p-hab-title">{habit.title}</span>
    </button>
  );
}
