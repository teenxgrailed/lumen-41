"use client";

import { useEffect, useRef } from "react";

import { useRouter } from "next/navigation";

import { useQueries } from "@tanstack/react-query";

import { useAskPhase } from "@/components/needt3/corner/AskProvider";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import {
  type PresenceIsland,
  type PresenceMemory,
  nextIsland,
  readMemory,
  rememberLater,
  rememberShown,
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
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { useNeedt3Ui } from "@/store/needt3-ui";

const KEY = "needt.habit-presence.v1";
const TICK_MS = 60_000;

function loadMemory(): PresenceMemory {
  try {
    return readMemory(localStorage.getItem(KEY));
  } catch {
    return readMemory(null);
  }
}

function saveMemory(m: PresenceMemory) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    // private storage: the island may repeat once in a new session
  }
}

/**
 * Habit presence in the open app (HANDOFF §4): once a minute, the corner
 * grows into an island when a habit's time comes, a Quit run reaches a
 * milestone, or the evening check-in is due — never while the Ask panel is
 * open, a focus runs or the assistant is answering, at most one island per
 * 20 minutes, never in quiet hours. Off with `habits_quit`. Renders nothing.
 */
export function HabitPresenceHost() {
  const gate = useQuitGate();
  if (gate === "off") return null;
  return <Presence />;
}

function Presence() {
  const router = useRouter();
  const tz = useTimeZone();
  const habits = useHabits().data ?? [];
  const checkins = useCheckins().data ?? [];
  const alerts = useAlerts().data;
  const focus = useFocusSession().data;
  const askOpen = useNeedt3Ui((s) => s.askOpen);
  const phase = useAskPhase();
  const toggle = useToggleHabitToday();
  const live = habits.filter((h) => !h.archivedAt);
  const quits = live.filter((h) => h.kind === "QUIT");
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

  // The latest inputs, read by the minute tick without restarting it.
  const latest = useRef({
    live,
    quits,
    summaries,
    checkins,
    alerts,
    busy: false,
  });
  latest.current = {
    live,
    quits,
    summaries,
    checkins,
    alerts,
    busy: askOpen || Boolean(focus) || phase !== "idle",
  };

  useEffect(() => {
    const show = (island: PresenceIsland, memory: PresenceMemory) => {
      const now = newDate().getTime();
      saveMemory(rememberShown(memory, island.key, now));
      if (island.kind === "reminder") {
        notify.info(island.title, {
          surface: "island",
          description: island.body,
          dedupeKey: island.key,
          actions: [
            {
              label: "Done",
              onClick: () => toggle.mutate({ id: island.habitId, done: true }),
            },
            ...(island.canLater
              ? [
                  {
                    label: "Later",
                    onClick: () =>
                      saveMemory(
                        rememberLater(
                          loadMemory(),
                          island.key,
                          newDate().getTime()
                        )
                      ),
                  },
                ]
              : []),
          ],
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
      if (!l.alerts) return;
      const now = newDate();
      const today = formatInTimeZone(now, tz, "yyyy-MM-dd");
      const memory = loadMemory();
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
              keptToday: mine.some((c) => c.date === today),
              remindersEnabled: h.remindersEnabled !== false,
              of14: mine.length,
            };
          }),
        quits: l.quits.map((h, i) => {
          const s = l.summaries[i]?.data;
          return {
            id: h.id,
            title: h.title,
            runStart: s?.streakStartedAt ?? h.quitStartedAt ?? null,
            best: s?.bestStreak ?? 0,
          };
        }),
      });
      if (island) show(island, memory);
    };

    const t = window.setInterval(tick, TICK_MS);
    tick();
    return () => window.clearInterval(t);
    // The tick reads `latest`; only the zone and the writers restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tz]);

  return null;
}
