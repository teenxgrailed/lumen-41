"use client";

import { useMemo } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { newDate } from "@/lib/date-utils";
import {
  type FocusRow,
  type FocusStats,
  statsFromApi,
} from "@/lib/needt3/focus";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { ApiError, fetchJson, sendJson } from "./core";

const SESSION_URL = "/api/focus/session";
const SESSION_KEY = qk.focusSession();

/** `GET /api/focus/session`: the one running session, or null. */
export function useFocusSession() {
  return useQuery({
    queryKey: qk.focusSession(),
    queryFn: async (): Promise<FocusRow | null> => {
      const body = await fetchJson<{
        active?: boolean;
        session?: FocusRow | null;
      }>(SESSION_URL, { cache: "no-store" });
      return body.active && body.session ? body.session : null;
    },
    // Another tab or the legacy /focus page may start or end it.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Today's minutes and the streak, from `GET /api/focus`. The route zeroes the
 * Focus score and the estimate accuracy on a plan without stats but still
 * sends the streak and the daily minutes, which is all the End view shows.
 */
export function useFocusStats(enabled: boolean) {
  return useQuery({
    queryKey: qk.focusStats(),
    enabled,
    queryFn: async (): Promise<FocusStats> =>
      statsFromApi(await fetchJson("/api/focus", { cache: "no-store" })),
    staleTime: 0,
  });
}

/** What a refusal says, in the product's words. */
function refusal(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.message === "ACTIVE_FOCUS_SESSION")
      return "A focus session is already running.";
    if (error.message === "UPGRADE_REQUIRED")
      return "That focus mode needs Pro.";
    if (error.message === "DEEP_FOCUS_LOCKED")
      return "This session is locked until it ends.";
  }
  return "Couldn't reach the focus session. Try again.";
}

export interface StartInput {
  taskId: string | null;
  intention: string;
  plannedMinutes: number;
  isBreak?: boolean;
}

export type FocusActions = ReturnType<typeof useFocusActions>;

/**
 * The lifecycle calls on `/api/focus/session`. Each one returns what the
 * server said (or null after telling the person it was refused) and keeps the
 * session query in step, so every reader — the window, the sidebar pill, a
 * second face — sees the same row. Pause and resume write ahead of the reply:
 * the clock must stop when the button is pressed, not a round trip later.
 */
export function useFocusActions() {
  const qc = useQueryClient();
  const key = SESSION_KEY;

  return useMemo(() => {
    const post = async (body: Record<string, unknown>) =>
      sendJson<{ session?: FocusRow | null } & Record<string, unknown>>(
        SESSION_URL,
        "POST",
        body
      );
    const hold = (row: FocusRow | null | undefined) =>
      qc.setQueryData<FocusRow | null>(key, row ?? null);

    async function start(input: StartInput): Promise<FocusRow | null> {
      try {
        const res = await post({
          action: "start",
          taskId: input.taskId,
          plannedMinutes: input.plannedMinutes,
          intention: input.intention,
          mode: "POMODORO",
          phase: input.isBreak ? "SHORT_BREAK" : "FOCUS",
          source: "web",
        });
        hold(res.session);
        return res.session ?? null;
      } catch (e) {
        notify.error(refusal(e));
        // The server may know a session this tab does not.
        void qc.invalidateQueries({ queryKey: key });
        return null;
      }
    }

    async function toggle(row: FocusRow, pause: boolean): Promise<boolean> {
      const before = qc.getQueryData<FocusRow | null>(key);
      const now = newDate();
      hold(
        pause
          ? { ...row, pausedAt: now.toISOString() }
          : {
              ...row,
              pausedAt: null,
              pausedTotalSeconds:
                row.pausedTotalSeconds +
                Math.max(
                  0,
                  Math.floor(
                    (now.getTime() -
                      (row.pausedAt
                        ? newDate(row.pausedAt).getTime()
                        : now.getTime())) /
                      1000
                  )
                ),
            }
      );
      try {
        const res = await post({
          action: pause ? "pause" : "resume",
          sessionId: row.id,
        });
        hold(res.session);
        return true;
      } catch (e) {
        hold(before);
        notify.error(refusal(e));
        return false;
      }
    }

    async function extend(row: FocusRow, minutes: number): Promise<boolean> {
      try {
        const res = await post({
          action: "extend",
          sessionId: row.id,
          minutes,
        });
        hold(res.session);
        return true;
      } catch (e) {
        notify.error(refusal(e));
        return false;
      }
    }

    /**
     * Ends the session. `completed` is the clock running out. A normal session
     * ends at once. A strict one (Pro: TIMEOUT) still has a server-side wait:
     * the first press asks for it and says so, the next one, after it, ends.
     */
    async function stop(row: FocusRow, completed: boolean): Promise<boolean> {
      try {
        await post({ action: "stop", sessionId: row.id, completed });
      } catch (e) {
        if (e instanceof ApiError && e.message === "EXIT_DELAY_REQUIRED") {
          let wait = 5;
          try {
            const res = await post({
              action: "request-stop",
              sessionId: row.id,
            });
            wait = Number(res.waitSeconds) || wait;
          } catch {
            /* the message below still says what to do */
          }
          notify.info(
            `This session has a stop delay. Press End session again in ${wait} s.`
          );
        } else if (e instanceof ApiError && e.message === "EXIT_DELAY_ACTIVE") {
          notify.info("Hold on a few seconds, then end the session again.");
        } else {
          notify.error(refusal(e));
        }
        void qc.invalidateQueries({ queryKey: key });
        return false;
      }
      hold(null);
      // The finished session changes the day's minutes and the task's actuals.
      void qc.invalidateQueries({ queryKey: qk.focusStats() });
      void qc.invalidateQueries({ queryKey: qk.tasks() });
      return true;
    }

    return {
      start,
      pause: (r: FocusRow) => toggle(r, true),
      resume: (r: FocusRow) => toggle(r, false),
      extend,
      stop,
    };
  }, [qc, key]);
}
