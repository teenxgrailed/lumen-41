"use client";

/* REMINDERS (v3) — `/api/reminders`, the same service the connector API and
 * the needt_reminders MCP tool use (src/services/reminders/reminders.ts).
 * Every write refreshes the bell, whose Reminders tab and Activity read them.
 */
import { useCallback } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { addDays, newDate, setHours, setMinutes } from "@/lib/date-utils";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { ApiError, fetchJson, sendJson } from "./core";

export interface V3Reminder {
  id: string;
  taskId: string | null;
  eventId: string | null;
  title: string;
  kind: "BEFORE_START" | "BEFORE_DEADLINE" | "AT_TIME";
  anchor: "start" | "deadline" | null;
  offsetMinutes: number | null;
  atTime: string | null;
  at: string | null;
  firesAt: string | null;
  snoozedUntil: string | null;
  status: string;
  label: string;
  link: string;
}

/** What the picker sends: relative to the anchor, or at a time. */
export type ReminderSpec =
  | {
      anchor?: "start" | "deadline";
      offsetMinutes: number;
      atTime?: string | null;
    }
  | { at: string };

export type ReminderTarget =
  | { taskId: string }
  | { eventId: string }
  | { title: string };

/** The picker's presets, in the order it lists them. */
export const REMINDER_PRESETS: { label: string; spec: ReminderSpec }[] = [
  { label: "At start", spec: { offsetMinutes: 0 } },
  { label: "10 min before", spec: { offsetMinutes: 10 } },
  { label: "30 min before", spec: { offsetMinutes: 30 } },
  { label: "1 hour before", spec: { offsetMinutes: 60 } },
  {
    label: "1 day before, 09:00",
    spec: { offsetMinutes: 1_440, atTime: "09:00" },
  },
];

/** Tomorrow at 09:00 on this device's clock: the bell's "Tomorrow". */
export function tomorrowMorning(now = newDate()): Date {
  return setMinutes(setHours(addDays(now, 1), 9), 0);
}

const remindersKey = (target: { taskId?: string; eventId?: string }) =>
  [
    ...qk.nudges(),
    "reminders",
    target.taskId ?? "",
    target.eventId ?? "",
  ] as const;

export function useReminders(
  target: { taskId?: string; eventId?: string },
  enabled = true
) {
  const query = new URLSearchParams();
  if (target.taskId) query.set("taskId", target.taskId);
  if (target.eventId) query.set("eventId", target.eventId);
  return useQuery({
    queryKey: remindersKey(target),
    queryFn: () =>
      fetchJson<{ reminders: V3Reminder[] }>(
        `/api/reminders?${query.toString()}`,
        { cache: "no-store" }
      ).then((r) => r.reminders),
    enabled: enabled && !!(target.taskId || target.eventId),
    staleTime: 30_000,
  });
}

function failed(error: unknown) {
  if (error instanceof ApiError && error.status === 403) {
    notify.error("Free includes one reminder per task", {
      description: "Change the one it has, or upgrade for more.",
    });
    return;
  }
  notify.error("Could not save the reminder", {
    description: error instanceof Error ? error.message : undefined,
  });
}

/** Create, change, snooze and delete; each refreshes the bell. */
export function useReminderActions() {
  const qc = useQueryClient();
  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: qk.nudges() }),
    [qc]
  );
  const run = useCallback(
    async <T>(work: () => Promise<T>): Promise<T | null> => {
      try {
        const out = await work();
        await refresh();
        return out;
      } catch (error) {
        failed(error);
        return null;
      }
    },
    [refresh]
  );
  return {
    create: (target: ReminderTarget, spec: ReminderSpec) =>
      run(() =>
        sendJson<V3Reminder>("/api/reminders", "POST", { ...target, ...spec })
      ),
    update: (id: string, spec: ReminderSpec) =>
      run(() =>
        sendJson<V3Reminder>(
          `/api/reminders/${encodeURIComponent(id)}`,
          "PATCH",
          spec
        )
      ),
    snooze: (id: string, until: Date) =>
      run(() =>
        sendJson<V3Reminder>(
          `/api/reminders/${encodeURIComponent(id)}`,
          "PATCH",
          {
            snoozeUntil: until.toISOString(),
          }
        )
      ),
    remove: (id: string) =>
      run(() =>
        sendJson<void>(`/api/reminders/${encodeURIComponent(id)}`, "DELETE")
      ),
  };
}
