"use client";

import { useEffect, useRef } from "react";

import { useRouter } from "next/navigation";

import { useQueries } from "@tanstack/react-query";

import { useAskPhase } from "@/components/needt3/corner/AskProvider";
import { hasNoticeSink } from "@/components/needt/corner/bridge";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import {
  PRESENCE_DUE_EVENT,
  cancelDesktopNotifications,
  desktopCanSchedule,
  desktopNotificationsAllowed,
  isDesktopApp,
  scheduleDesktopNotifications,
  sendDesktopNotification,
} from "@/lib/desktop";
import {
  EMPTY_MEMORY,
  ISLAND_GAP_MS,
  type PresenceIsland,
  type PresenceMemory,
  type PresenceSettings,
  type ScheduledMoment,
  nextIsland,
  presenceSchedule,
  readMemory,
  rememberShown,
  seedMemory,
} from "@/lib/needt3/habit-presence";
import type { QuitSummary } from "@/lib/needt3/habits-quit";
import { useAlerts } from "@/lib/needt3/hooks/account";
import { fetchJson } from "@/lib/needt3/hooks/core";
import { useFocusSession } from "@/lib/needt3/hooks/focus";
import {
  useCheckins,
  useHabits,
  useToggleHabitToday,
} from "@/lib/needt3/hooks/habits";
import { useQuitGate } from "@/lib/needt3/hooks/habits-quit";
import { useSettings, useTimeZone } from "@/lib/needt3/hooks/settings";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { useNeedt3Ui } from "@/store/needt3-ui";

const KEY = "needt.habit-presence.v1";
const TICK_MS = 60_000;

/*
 * What this device has shown. localStorage when it can be used; when it
 * throws (private mode, blocked site data) the same record lives in memory
 * for the session, so a blocked store never repeats an island every minute.
 */
let fallback: PresenceMemory | null = null;

function loadMemory(): PresenceMemory {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null && fallback ? fallback : readMemory(raw);
  } catch {
    return fallback ?? EMPTY_MEMORY;
  }
}

function saveMemory(m: PresenceMemory) {
  fallback = m;
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    // blocked storage: `fallback` holds it for this session
  }
}

/** Close the push that said the same thing (same tag), if one is showing. */
function closePush(tag: string) {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
  void navigator.serviceWorker
    .getRegistration()
    .then((reg) => reg?.getNotifications({ tag }))
    .then((list) => list?.forEach((n) => n.close()))
    .catch(() => undefined);
}

/**
 * Habit presence in the open app (HANDOFF §4): once a minute, the corner
 * grows into an island when a habit's time comes, a Quit run reaches a
 * milestone, or the evening check-in is due — never while the Ask panel is
 * open, a focus runs or the assistant is answering, at most one island per
 * 20 minutes, never in quiet hours, and only with Reminders and In the app
 * on and no daily digest. The rules are the push sweep's.
 *
 * Mounted where the island lives (the desktop corner, PermanentHosts). The
 * phone has no island: there the channel is the push only.
 */
export function HabitPresenceHost() {
  const gate = useQuitGate();
  // With habits_quit off for this account (another account signed in, the
  // flag turned off) nothing of a previous set may still fire.
  useEffect(() => {
    if (gate === "off" && desktopCanSchedule())
      scheduleDesktopNotifications([]);
  }, [gate]);
  if (gate === "off") return null;
  // Milestones (and Quit in the check-in count) are Pro, as on the server.
  return <Presence quitOn={gate === "on"} />;
}

function Presence({ quitOn }: { quitOn: boolean }) {
  const router = useRouter();
  const settings = useSettings();
  const tz = useTimeZone();
  const habitsQ = useHabits();
  const checkinsQ = useCheckins();
  const alertsQ = useAlerts();
  const focus = useFocusSession().data;
  const askOpen = useNeedt3Ui((s) => s.askOpen);
  const phase = useAskPhase();
  const toggle = useToggleHabitToday();
  const live = (habitsQ.data ?? []).filter((h) => !h.archivedAt);
  const quits = quitOn ? live.filter((h) => h.kind === "QUIT") : [];
  const summaries = useQueries({
    queries: quits.map((h) => ({
      queryKey: qk.quitSummary(h.id),
      queryFn: async () =>
        (
          await fetchJson<{ summary: QuitSummary }>(
            `/api/habits/${h.id}/quit-summary`
          )
        ).summary,
    })),
  });

  // Nothing is judged on half-loaded data: an empty check-in list would
  // read as "nothing done", a missing summary as no run, a zone not yet read
  // as the browser's.
  const ready =
    habitsQ.isSuccess &&
    checkinsQ.isSuccess &&
    alertsQ.isSuccess &&
    settings.isSuccess &&
    summaries.every((q) => q.isSuccess);

  const latest = useRef({
    ready,
    live,
    quits,
    summaries,
    checkins: checkinsQ.data ?? [],
    alerts: alertsQ.data,
    busy: false,
  });
  latest.current = {
    ready,
    live,
    quits,
    summaries,
    checkins: checkinsQ.data ?? [],
    alerts: alertsQ.data,
    busy: askOpen || Boolean(focus) || phase !== "idle",
  };

  useEffect(() => {
    const show = async (island: PresenceIsland, settings: PresenceSettings) => {
      const now = newDate().getTime();
      const due = (m: PresenceMemory) =>
        !m.seen.includes(island.key) &&
        !(m.lastShownAt && now - m.lastShownAt < ISLAND_GAP_MS);
      // In the desktop app with its window not in front (hidden, or another
      // window focused), the island would go unseen: a system notification
      // says it instead, with the push's tag, if Mac notifications are on.
      const front =
        document.visibilityState === "visible" && document.hasFocus();
      // (A shell that schedules has shown it at its time already.)
      if (
        isDesktopApp() &&
        !desktopCanSchedule() &&
        !front &&
        settings.channelMac !== false
      ) {
        // Claimed before the send, so a second window of the app does not
        // send it too while this one waits; given back if the send fails.
        const before = loadMemory();
        if (!due(before)) return;
        saveMemory(rememberShown(before, island.key, now));
        const sent = await sendDesktopNotification(
          island.title,
          island.body,
          island.kind === "milestone"
            ? `/habits?quit=${encodeURIComponent(island.habitId)}`
            : "/habits",
          { ask: false, tag: island.tag }
        );
        if (sent) return;
        const after = loadMemory();
        saveMemory({
          ...after,
          seen: after.seen.filter((k) => k !== island.key),
          lastShownAt: before.lastShownAt,
        });
      }
      if (!settings.channelInApp || !hasNoticeSink("island")) return;
      // Read again right before showing: another tab may have shown it.
      const fresh = loadMemory();
      if (!due(fresh)) return;
      saveMemory(rememberShown(fresh, island.key, now));
      islandSaid.add(island.tag);
      closePush(island.tag);
      // The Mac app's own notification of the same moment, if it showed one.
      cancelDesktopNotifications([island.tag]);
      if (island.kind === "reminder") {
        notify.info(island.title, {
          surface: "island",
          description: island.body,
          dedupeKey: island.key,
          action: {
            label: "Done",
            onClick: () => {
              toggle.mutate({ id: island.habitId, done: true });
              closePush(island.tag);
            },
          },
        });
        return;
      }
      notify.info(island.title, {
        surface: "island",
        description: island.body,
        dedupeKey: island.key,
        action: {
          label: "Open",
          onClick: () =>
            router.push(
              island.kind === "milestone"
                ? `/habits?quit=${encodeURIComponent(island.habitId)}`
                : "/habits"
            ),
        },
      });
    };

    const scheduled = { current: "" };
    let planByTag = new Map<string, ScheduledMoment>();
    const islandSaid = new Set<string>();
    const tick = () => {
      const l = latest.current;
      // No receiver (the corner is not mounted, and no desktop app to show a
      // system notification): say nothing and remember nothing, so the
      // moment is not spent on a notice no one sees.
      if (!l.ready || !l.alerts) return;
      if (!hasNoticeSink("island") && !isDesktopApp()) return;
      const now = newDate();
      const today = formatInTimeZone(now, tz, "yyyy-MM-dd");
      const quits = l.quits.flatMap((h, i) => {
        const s = l.summaries[i]?.data;
        return s
          ? [
              {
                id: h.id,
                title: h.title,
                remindersEnabled: h.remindersEnabled !== false,
                currentStreak: s.currentStreak,
                lastMilestone: s.lastMilestone ?? null,
                streakStartedAt: s.streakStartedAt,
                nextMilestone: s.nextMilestone,
              },
            ]
          : [];
      });
      let memory = loadMemory();
      if (!memory.seeded) {
        memory = seedMemory(memory, quits);
        saveMemory(memory);
      }
      const dos = l.live
        .filter((h) => h.kind !== "QUIT")
        .map((h) => {
          const mine = l.checkins.filter((c) => c.habitId === h.id && c.done);
          return {
            id: h.id,
            title: h.title,
            at: h.schedule.time,
            daysOfWeek: h.daysOfWeek ?? [],
            doneToday: mine.some((c) => c.date === today),
            remindersEnabled: h.remindersEnabled !== false,
            of14: mine.length,
          };
        });
      // A Mac app that can schedule gets the next day and a half of moments
      // to show at their times by itself, the window closed or the page
      // asleep. Sent again only when the set changes: a habit marked done
      // drops its reminder, a new time moves it.
      if (desktopCanSchedule()) {
        const plan = presenceSchedule({
          now,
          timeZone: tz,
          settings: l.alerts,
          dos,
          quits,
        });
        planByTag = new Map(plan.map((m) => [m.tag, m]));
        //todo: once NeedtRemotePush is on, the server's push and this local
        // notification can both arrive for one moment on this Mac. They share
        // the tag (apns-collapse-id = identifier), so the later replaces the
        // earlier in Notification Center, but both may sound; skip the local
        // one when this Mac has a saved APNs token.
        // Nothing is scheduled without the system's permission (asked only
        // by Allow in Settings, which shows the status).
        void desktopNotificationsAllowed().then((allowed) => {
          const set = allowed ? plan : [];
          const key = JSON.stringify(set);
          if (key === scheduled.current) return;
          scheduled.current = key;
          scheduleDesktopNotifications(set);
        });
      }
      const island = nextIsland({
        now,
        timeZone: tz,
        busy: l.busy,
        memory,
        settings: l.alerts,
        dos,
        quits,
      });
      if (island) void show(island, l.alerts);
    };

    // The app says a scheduled moment came due with Needt in front (it held
    // the banner back): the island says it, or, when the island cannot (Ask
    // open, a focus, the 20-minute gap, not loaded), the banner shows.
    const due = (e: Event) => {
      const tag = (e as CustomEvent<string>).detail;
      if (typeof tag !== "string") return;
      tick();
      if (islandSaid.has(tag)) return;
      const moment = planByTag.get(tag);
      if (!moment) return;
      void sendDesktopNotification(moment.title, moment.body, moment.url, {
        ask: false,
        tag,
        banner: true,
      });
    };
    window.addEventListener(PRESENCE_DUE_EVENT, due);

    const t = window.setInterval(tick, TICK_MS);
    tick();
    return () => {
      window.clearInterval(t);
      window.removeEventListener(PRESENCE_DUE_EVENT, due);
      // Gone (a downgrade's gate, sign-out in the page, unmount): the app's
      // set goes too; the next mount schedules afresh.
      if (desktopCanSchedule()) scheduleDesktopNotifications([]);
    };
    // The tick reads `latest`. The zone restarts it, and so does the data
    // landing: the first check waits for it, not for the next minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tz, ready]);

  return null;
}
