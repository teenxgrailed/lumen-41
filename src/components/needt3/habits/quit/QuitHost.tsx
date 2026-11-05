"use client";

import { useEffect, useRef, useState } from "react";

import { askNeedt } from "@/components/needt3/corner/ask-bridge";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import {
  type QuitGate,
  type QuitSummary,
  TALKED_NOTE,
  assistantContext,
  milestoneView,
  pullLog,
  pullsToday,
  runParts,
  summaryMilestone,
  urgeMap,
} from "@/lib/needt3/habits-quit";
import {
  useHabitEvents,
  useLogHabitEvent,
  usePatchHabitEvent,
  useQuitGate,
  useQuitSummary,
} from "@/lib/needt3/hooks/habits-quit";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import type { V3Habit } from "@/lib/needt3/map";

import {
  QuitCard,
  QuitCounter,
  QuitLock,
  QuitMap,
  QuitMilestone,
  QuitPullLog,
  QuitRow,
  QuitSlipConfirm,
  quitMeta,
  useMinuteClock,
} from "./QuitParts";
import { type PullStep, type PullTrigger, QuitPull } from "./QuitPull";

/** A running pull: where the flow is, and what it has written. */
export interface PullSession {
  habitId: string;
  step: PullStep;
  /** When the breath began (epoch ms). */
  startedAt: number;
  trigger: PullTrigger | null;
}

/**
 * What the Quit part of the Habits route holds, called once by the route
 * above the phone / desktop switch and handed to both faces (two faces, one
 * state): which Quit habit is open, and the pull in progress with its step,
 * its breath and its writes, so crossing 700 px neither restarts the breath
 * nor logs the pull twice.
 *
 * The pull is logged here, on the press (not while rendering): one URGE per
 * press, also under a doubled development effect. "No, it passed" writes
 * the held pull at once and the trigger is added to it later, so leaving
 * without Done loses nothing.
 */
export function useQuitController() {
  const gate = useQuitGate();
  const log = useLogHabitEvent();
  const [openId, setOpenId] = useState<string | null>(null);
  const [session, setSession] = useState<PullSession | null>(null);
  const writes = useRef<{
    urge: Promise<string | null> | null;
    held: Promise<string | null> | null;
  }>({ urge: null, held: null });
  const canWrite = gate === "on";

  const record = (habitId: string, type: "URGE" | "RESISTED") =>
    canWrite
      ? log
          .mutateAsync({ habitId, type })
          .then((e) => e.id)
          .catch(() => null)
      : Promise.resolve(null);

  return {
    openId,
    pullId: session?.habitId ?? null,
    session,
    writes,
    open: setOpenId,
    pull: (habitId: string | null) => {
      if (!habitId) {
        setSession(null);
        writes.current = { urge: null, held: null };
        return;
      }
      if (session?.habitId === habitId) return;
      writes.current = { urge: record(habitId, "URGE"), held: null };
      setSession({
        habitId,
        step: "breathe",
        startedAt: newDate().getTime(),
        trigger: null,
      });
    },
    step: (step: PullStep) => setSession((s) => (s ? { ...s, step } : s)),
    trigger: (trigger: PullTrigger) =>
      setSession((s) => (s ? { ...s, trigger } : s)),
    /** "No, it passed": the held pull is written now. */
    held: (habitId: string) => {
      if (!writes.current.held)
        writes.current.held = record(habitId, "RESISTED");
    },
  };
}
export type QuitController = ReturnType<typeof useQuitController>;

export const isQuit = (h: V3Habit) => h.kind === "QUIT";

/** The run starts at the last slip, or at the quit date. */
const runStart = (h: V3Habit, s: QuitSummary | undefined) =>
  s?.streakStartedAt ?? h.quitStartedAt ?? null;

const restarted = (s: QuitSummary | undefined) =>
  Boolean(s && s.counts.RELAPSE > 0 && s.currentStreak === 0);

/**
 * Days and milestones as the server counts them (calendar days in the
 * person's zone) once the summary is here; elapsed time until then. Hours
 * and minutes stay elapsed: they are the live counter only.
 */
function quitDays(s: QuitSummary | undefined, start: string | null, now: Date) {
  const run = runParts(start, now);
  return {
    run,
    days: s ? s.currentStreak : run.days,
    ms: s ? summaryMilestone(s) : milestoneView(start, now),
  };
}

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return online;
}

/** One Quit habit in the list: a card on the desktop, a row on the phone. */
function QuitItem({
  habit,
  phone,
  ctl,
}: {
  habit: V3Habit;
  phone: boolean;
  ctl: QuitController;
}) {
  const summary = useQuitSummary(habit.id).data;
  const now = useMinuteClock();
  const { run, ms } = quitDays(summary, runStart(habit, summary), now);
  const meta = quitMeta(ms, restarted(summary), summary?.bestStreak ?? 0);
  const props = {
    habit,
    run,
    meta,
    onPull: () => ctl.pull(habit.id),
    onOpen: () => ctl.open(habit.id),
  };
  return phone ? <QuitRow {...props} /> : <QuitCard {...props} />;
}

/**
 * 1 · the Quit habits in the list, or the Pro card on Free. Nothing at all
 * while `habits_quit` is off for this account.
 */
export function QuitList({
  habits,
  gate,
  phone,
  ctl,
  storeBuild,
  onSeePro,
}: {
  habits: readonly V3Habit[];
  gate: QuitGate;
  phone: boolean;
  ctl: QuitController;
  storeBuild: boolean;
  onSeePro: () => void;
}) {
  if (gate === "off") return null;
  // A downgraded account keeps its Quit habits readable.
  if (!habits.length && gate === "upgrade")
    return <QuitLock storeBuild={storeBuild} onSeePro={onSeePro} />;
  if (!habits.length) return null;
  return (
    <div className={phone ? "hq-rows" : "hq-grid"} data-hq-list="">
      {habits.map((h) => (
        <QuitItem key={h.id} habit={h} phone={phone} ctl={ctl} />
      ))}
    </div>
  );
}

/**
 * 3 · a pull. The press already logged it (`useQuitController.pull`), so
 * closing at any step still counts it; "No, it passed" writes a held pull and
 * the trigger is added to both, "I slipped" writes a slip and closes once it
 * is saved, "Yes, still" opens the assistant with the context in it.
 */
export function QuitPullHost({
  habit,
  ctl,
  session,
  desk,
  readOnly,
  onUpgrade,
}: {
  habit: V3Habit;
  ctl: QuitController;
  session: PullSession;
  desk: boolean;
  /**
   * The gate is not "on" (Free, or a downgrade): the habit stays readable but
   * takes no new events. Breathing and the reason still run, nothing is
   * written, and the steps that would write lead to Pro.
   */
  readOnly: boolean;
  onUpgrade: () => void;
}) {
  const tz = useTimeZone();
  const online = useOnline();
  const summary = useQuitSummary(habit.id).data;
  const events = useHabitEvents(habit.id).data ?? [];
  const log = useLogHabitEvent();
  const patch = usePatchHabitEvent();
  const now = useMinuteClock();

  const patchOn = (
    write: Promise<string | null> | null,
    fields: {
      tag?: string | null;
      intensity?: number | null;
      note?: string | null;
    }
  ) =>
    void write?.then((eventId) =>
      eventId
        ? patch.mutate({ habitId: habit.id, eventId, ...fields })
        : undefined
    );

  const start = runStart(habit, summary);
  const { run, days } = quitDays(summary, start, now);
  return (
    <QuitPull
      title={habit.title}
      reason={habit.reason ?? null}
      run={run}
      days={days}
      since={
        habit.quitStartedAt
          ? formatInTimeZone(habit.quitStartedAt, tz, "d MMM")
          : null
      }
      best={summary?.bestStreak ?? 0}
      clean={summary?.totalCleanDays ?? 0}
      held={summary?.counts.RESISTED ?? 0}
      // The server's gate, not the plan read: that one says Pro while loading.
      pro={!readOnly}
      desk={desk}
      online={online}
      step={session.step}
      startedAt={session.startedAt}
      trigger={session.trigger}
      restore={`[data-hq-pull="${habit.id}"]`}
      onStep={ctl.step}
      onHeld={() => ctl.held(habit.id)}
      onTrigger={(t) => {
        ctl.trigger(t);
        const fields = { tag: t.tag, intensity: t.strength };
        // On the pull (where the pattern map and the tag counts read it) and
        // on the held pull.
        patchOn(ctl.writes.current.urge, fields);
        patchOn(ctl.writes.current.held, fields);
      }}
      onSlip={async () => {
        if (readOnly) {
          onUpgrade();
          return false;
        }
        try {
          await log.mutateAsync({ habitId: habit.id, type: "RELAPSE" });
          return true;
        } catch {
          return false; // the hook said why
        }
      }}
      onStill={() => {
        if (readOnly) {
          onUpgrade();
          return;
        }
        patchOn(ctl.writes.current.urge, { note: TALKED_NOTE });
        askNeedt(
          assistantContext({
            title: habit.title,
            run,
            tag: session.trigger?.tag ?? null,
            strength: session.trigger?.strength ?? null,
            pullsToday: pullsToday(events, now, tz),
            reason: habit.reason ?? null,
            time: formatInTimeZone(now, tz, "HH:mm"),
          })
        );
        ctl.pull(null);
      }}
      onClose={() => ctl.pull(null)}
    />
  );
}

/** 2 · a Quit habit: the count, the reason, the next milestone, the pulls. */
export function QuitDetail({
  habit,
  phone,
  readOnly,
  onBack,
  onPull,
  onUpgrade,
}: {
  habit: V3Habit;
  phone: boolean;
  /** Free after a downgrade: readable, and "I slipped" leads to Pro. */
  readOnly: boolean;
  onBack: () => void;
  onPull: () => void;
  onUpgrade: () => void;
}) {
  const tz = useTimeZone();
  const summaryQ = useQuitSummary(habit.id);
  const summary = summaryQ.data;
  const eventsQ = useHabitEvents(habit.id);
  const events = eventsQ.data ?? [];
  const log = useLogHabitEvent();
  const now = useMinuteClock();
  const [confirm, setConfirm] = useState(false);
  const start = runStart(habit, summary);
  const { run, days, ms } = quitDays(summary, start, now);
  const map = urgeMap(events, now, tz);
  const since = start ? formatInTimeZone(start, tz, "d MMM, HH:mm") : null;
  return (
    <div className="hq-detail" data-hq-detail={habit.id}>
      <button
        type="button"
        className="hq-btn is-text is-sm hq-back"
        onClick={onBack}
      >
        Habits
      </button>
      <div className="hq-hero">
        <span className="hq-eyebrow">
          {habit.title}
          {since ? ` · since ${since}` : ""}
        </span>
        {summaryQ.isPending && !habit.quitStartedAt ? (
          <b className="big hq-num" aria-busy="true">
            —
          </b>
        ) : (
          <QuitCounter run={run} big minutes={!phone || run.days < 100} />
        )}
        {habit.reason ? <span className="hq-why">“{habit.reason}”</span> : null}
      </div>
      <QuitMilestone ms={ms} days={days} />
      <div className="hq-stats">
        <div className="hq-stat">
          <b className="hq-num">{summary?.bestStreak ?? 0} d</b>
          <span>Best run</span>
        </div>
        <div className="hq-stat">
          <b className="hq-num">{summary?.totalCleanDays ?? 0} d</b>
          <span>Clean in all</span>
        </div>
        <div className="hq-stat">
          <b className="hq-num">{summary?.counts.RESISTED ?? 0}</b>
          <span>Pulls held</span>
        </div>
      </div>
      <div className="hq-h">
        <span>Pulls</span>
        <span>Last 7 days</span>
      </div>
      {eventsQ.isError ? (
        <p className="hq-meta hq-empty" role="alert">
          Could not load the pulls. They are still saved.
        </p>
      ) : (
        <QuitPullLog rows={pullLog(events, now, tz)} />
      )}
      {map.note ? (
        <>
          <div className="hq-h">
            <span>When it pulls</span>
          </div>
          <QuitMap map={map} />
        </>
      ) : null}
      {confirm ? (
        <QuitSlipConfirm
          run={run}
          days={days}
          best={summary?.bestStreak ?? 0}
          clean={summary?.totalCleanDays ?? 0}
          busy={log.isPending}
          onCancel={() => setConfirm(false)}
          onConfirm={() =>
            // The hook tells a failure; the card stays so it can be tried again.
            void log
              .mutateAsync({ habitId: habit.id, type: "RELAPSE" })
              .then(() => setConfirm(false))
              .catch(() => undefined)
          }
        />
      ) : (
        <div className="hq-detail-acts">
          <button
            type="button"
            className="hq-btn is-primary"
            data-hq-pull={habit.id}
            onClick={onPull}
          >
            Pulling
          </button>
          <button
            type="button"
            className="hq-btn is-text"
            data-hq-slip=""
            onClick={() => (readOnly ? onUpgrade() : setConfirm(true))}
          >
            I slipped
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The Quit layer of a Habits face: the open Quit habit replaces the list,
 * and a pull covers the canvas. Returns null when neither is open, so the
 * face draws its list.
 */
export function QuitLayer({
  habits,
  ctl,
  gate,
  phone,
  detailOnly,
  onUpgrade,
}: {
  habits: readonly V3Habit[];
  ctl: QuitController;
  gate: QuitGate;
  phone: boolean;
  /** Draw only the open habit, never the pull (the phone draws that above). */
  detailOnly?: boolean;
  onUpgrade: () => void;
}) {
  const readOnly = gate !== "on";
  const pulling = habits.find((h) => h.id === ctl.pullId) ?? null;
  const open = habits.find((h) => h.id === ctl.openId) ?? null;
  if (pulling && ctl.session && !detailOnly)
    return (
      <QuitPullHost
        habit={pulling}
        ctl={ctl}
        session={ctl.session}
        desk={!phone}
        readOnly={readOnly}
        onUpgrade={onUpgrade}
      />
    );
  if (open)
    return (
      <QuitDetail
        habit={open}
        phone={phone}
        readOnly={readOnly}
        onBack={() => ctl.open(null)}
        onPull={() => ctl.pull(open.id)}
        onUpgrade={onUpgrade}
      />
    );
  return null;
}
