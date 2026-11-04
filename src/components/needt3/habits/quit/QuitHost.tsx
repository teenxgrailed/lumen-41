"use client";

import { useEffect, useRef, useState } from "react";

import { askNeedt } from "@/components/needt3/corner/ask-bridge";
import { useIsPro } from "@/components/needt3/paywall/Pro";

import { formatInTimeZone } from "@/lib/date-utils";
import {
  type QuitGate,
  type QuitSummary,
  TALKED_NOTE,
  assistantContext,
  milestoneView,
  pullLog,
  pullsToday,
  runParts,
  urgeMap,
} from "@/lib/needt3/habits-quit";
import {
  useHabitEvents,
  useLogHabitEvent,
  usePatchHabitEvent,
  useQuitSummary,
} from "@/lib/needt3/hooks/habits-quit";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import type { V3Habit } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

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
import { type PullTrigger, QuitPull } from "./QuitPull";

/**
 * What the Quit part of the Habits route holds, called once by the route
 * above the phone / desktop switch and handed to both faces (two faces, one
 * state): which Quit habit is open, and which one is in a pull.
 */
export function useQuitController() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [pullId, setPullId] = useState<string | null>(null);
  return { openId, pullId, open: setOpenId, pull: setPullId };
}
export type QuitController = ReturnType<typeof useQuitController>;

export const isQuit = (h: V3Habit) => h.kind === "QUIT";

/** The run starts at the last slip, or at the quit date. */
const runStart = (h: V3Habit, s: QuitSummary | undefined) =>
  s?.streakStartedAt ?? h.quitStartedAt ?? null;

const restarted = (s: QuitSummary | undefined) =>
  Boolean(s && s.counts.RELAPSE > 0 && s.currentStreak === 0);

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
  const start = runStart(habit, summary);
  const run = runParts(start, now);
  const meta = quitMeta(
    milestoneView(start, now),
    restarted(summary),
    summary?.bestStreak ?? 0
  );
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
 * 3 · a pull. The press is logged at once as a pull, so closing at any step
 * still counts it; "No, it passed" adds a held pull with the trigger, "I
 * slipped" a slip, "Yes, still" opens the assistant with the context in it.
 */
export function QuitPullHost({
  habit,
  desk,
  onUpgrade,
  onClose,
}: {
  habit: V3Habit;
  desk: boolean;
  onUpgrade: () => void;
  onClose: () => void;
}) {
  const tz = useTimeZone();
  const pro = useIsPro();
  const online = useOnline();
  const summary = useQuitSummary(habit.id).data;
  const events = useHabitEvents(habit.id).data ?? [];
  const log = useLogHabitEvent();
  const patch = usePatchHabitEvent();
  const now = useMinuteClock();
  const urge = useRef<Promise<string | null> | null>(null);
  const held = useRef<{ trigger: PullTrigger | null } | null>(null);

  // Logged once per press (a ref, so a development double effect does not
  // write it twice).
  if (!urge.current) {
    urge.current = log
      .mutateAsync({ habitId: habit.id, type: "URGE" })
      .then((e) => e.id)
      .catch(() => null);
  }

  const patchUrge = (fields: {
    tag?: string | null;
    intensity?: number | null;
    note?: string | null;
  }) =>
    void urge.current?.then((eventId) =>
      eventId
        ? patch.mutate({ habitId: habit.id, eventId, ...fields })
        : undefined
    );

  const close = () => {
    // A held pull is written when the flow closes, with the trigger tapped
    // on the way, so the tag lands even where the pull itself cannot be
    // edited.
    if (held.current) {
      const t = held.current.trigger;
      held.current = null;
      log.mutate({
        habitId: habit.id,
        type: "RESISTED",
        tag: t?.tag ?? null,
        intensity: t?.strength ?? null,
      });
    }
    onClose();
  };

  const start = runStart(habit, summary);
  const run = runParts(start, now);
  return (
    <QuitPull
      title={habit.title}
      reason={habit.reason ?? null}
      run={run}
      since={
        habit.quitStartedAt
          ? formatInTimeZone(habit.quitStartedAt, tz, "d MMM")
          : null
      }
      best={summary?.bestStreak ?? 0}
      clean={summary?.totalCleanDays ?? 0}
      held={summary?.counts.RESISTED ?? 0}
      pro={pro}
      desk={desk}
      online={online}
      onHeld={() => {
        held.current = { trigger: null };
      }}
      onTrigger={(t) => {
        if (held.current) held.current.trigger = t;
        patchUrge({ tag: t.tag, intensity: t.strength });
      }}
      onSlip={() =>
        log.mutate(
          { habitId: habit.id, type: "RELAPSE" },
          {
            onError: () =>
              notify.error("Could not start again. Try once more."),
          }
        )
      }
      onStill={() => {
        if (!pro) {
          onUpgrade();
          return;
        }
        patchUrge({ note: TALKED_NOTE });
        askNeedt(
          assistantContext({
            title: habit.title,
            run,
            tag: null,
            strength: null,
            pullsToday: pullsToday(events, now, tz) + 1,
            reason: habit.reason ?? null,
            time: formatInTimeZone(now, tz, "HH:mm"),
          })
        );
        onClose();
      }}
      onClose={close}
    />
  );
}

/** 2 · a Quit habit: the count, the reason, the next milestone, the pulls. */
export function QuitDetail({
  habit,
  phone,
  onBack,
  onPull,
}: {
  habit: V3Habit;
  phone: boolean;
  onBack: () => void;
  onPull: () => void;
}) {
  const tz = useTimeZone();
  const summaryQ = useQuitSummary(habit.id);
  const summary = summaryQ.data;
  const events = useHabitEvents(habit.id).data ?? [];
  const log = useLogHabitEvent();
  const now = useMinuteClock();
  const [confirm, setConfirm] = useState(false);
  const start = runStart(habit, summary);
  const run = runParts(start, now);
  const ms = milestoneView(start, now);
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
      <QuitMilestone ms={ms} run={run} />
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
      <QuitPullLog rows={pullLog(events, now, tz)} />
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
          best={summary?.bestStreak ?? 0}
          clean={summary?.totalCleanDays ?? 0}
          busy={log.isPending}
          onCancel={() => setConfirm(false)}
          onConfirm={() =>
            log.mutate(
              { habitId: habit.id, type: "RELAPSE" },
              {
                onSuccess: () => setConfirm(false),
                onError: () =>
                  notify.error("Could not start again. Try once more."),
              }
            )
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
            onClick={() => setConfirm(true)}
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
  phone,
  onUpgrade,
}: {
  habits: readonly V3Habit[];
  ctl: QuitController;
  phone: boolean;
  onUpgrade: () => void;
}) {
  const pulling = habits.find((h) => h.id === ctl.pullId) ?? null;
  const open = habits.find((h) => h.id === ctl.openId) ?? null;
  if (pulling)
    return (
      <QuitPullHost
        key={pulling.id}
        habit={pulling}
        desk={!phone}
        onUpgrade={onUpgrade}
        onClose={() => ctl.pull(null)}
      />
    );
  if (open)
    return (
      <QuitDetail
        habit={open}
        phone={phone}
        onBack={() => ctl.open(null)}
        onPull={() => ctl.pull(open.id)}
      />
    );
  return null;
}
