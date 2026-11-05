"use client";

import { useEffect, useRef } from "react";

import { useRouter } from "next/navigation";

import { useQueries } from "@tanstack/react-query";

import { useAskPhase } from "@/components/needt3/corner/AskProvider";
import { hasNoticeSink } from "@/components/needt/corner/bridge";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import {
  EMPTY_MEMORY,
  ISLAND_GAP_MS,
  type PresenceIsland,
  type PresenceMemory,
  nextIsland,
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
    const show = (island: PresenceIsland) => {
      // Read again right before showing: another tab may have shown it.
      const fresh = loadMemory();
      const now = newDate().getTime();
      if (fresh.seen.includes(island.key)) return;
      if (fresh.lastShownAt && now - fresh.lastShownAt < ISLAND_GAP_MS) return;
      saveMemory(rememberShown(fresh, island.key, now));
      closePush(island.tag);
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

    const tick = () => {
      const l = latest.current;
      // No receiver (the corner is not mounted): say nothing and remember
      // nothing, so the moment is not spent on a notice no one sees.
      if (!l.ready || !l.alerts || !hasNoticeSink("island")) return;
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
              },
            ]
          : [];
      });
      let memory = loadMemory();
      if (!memory.seeded) {
        memory = seedMemory(memory, quits);
        saveMemory(memory);
      }
      const island = nextIsland({
        now,
        timeZone: tz,
        busy: l.busy,
        memory,
        settings: l.alerts,
        dos: l.live
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
          }),
        quits,
      });
      if (island) show(island);
    };

    const t = window.setInterval(tick, TICK_MS);
    tick();
    return () => window.clearInterval(t);
    // The tick reads `latest`. The zone restarts it, and so does the data
    // landing: the first check waits for it, not for the next minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tz, ready]);

  return null;
}
