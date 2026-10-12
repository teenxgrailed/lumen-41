"use client";

/**
 * What the Settings sheet reads and writes beyond `UserSettings`: working
 * hours and the gap between tasks (`/api/auto-schedule-settings`), the alert
 * switches (`/api/notification-settings`) and checkout / billing portal
 * (`/api/billing/*`). Every read and write is optimistic and returns an
 * `undo()`, like the rest of the v3 hooks.
 *
 * //todo: qk has no key for these two; they sit under `qk.settings()` so
 * a settings invalidation refreshes them. Name them in query-keys.ts if the
 * integrator wants them separate.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

import { fetchJson, sendJson, useUndoableMutation } from "./core";

/* ---------- working hours ---------- */

export interface V3Schedule {
  workDays: string;
  workHourStart: number;
  workHourEnd: number;
  bufferMinutes: number;
}

const SCHEDULE = [...qk.settings(), "schedule"] as const;

export function useSchedule() {
  return useQuery({
    queryKey: SCHEDULE,
    queryFn: async (): Promise<V3Schedule> => {
      const row = await fetchJson<Partial<V3Schedule>>(
        "/api/auto-schedule-settings"
      );
      return {
        workDays: row.workDays ?? "[1,2,3,4,5]",
        workHourStart: row.workHourStart ?? 9,
        workHourEnd: row.workHourEnd ?? 17,
        bufferMinutes: row.bufferMinutes ?? 15,
      };
    },
    staleTime: 5 * 60_000,
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useUndoableMutation<Partial<V3Schedule>, unknown>({
    scope: SCHEDULE,
    label: "save the working hours",
    inverse: (_qc, patch) => {
      const cur = qc.getQueryData<V3Schedule>(SCHEDULE);
      if (!cur) return null;
      const back: Partial<V3Schedule> = {};
      for (const k of Object.keys(patch) as (keyof V3Schedule)[])
        (back as Record<string, unknown>)[k] = cur[k];
      return back;
    },
    optimistic: (client, patch) =>
      client.setQueryData<V3Schedule>(SCHEDULE, (cur) =>
        cur ? { ...cur, ...patch } : cur
      ),
    request: (patch) => sendJson("/api/auto-schedule-settings", "PATCH", patch),
  });
}

/* ---------- alerts ---------- */

export interface V3Alerts {
  dailyPlan: boolean;
  dailyPlanTime: string;
  mailPlan: boolean;
  nudges: boolean;
  weeklyReview: boolean;
}

const ALERTS = [...qk.settings(), "alerts"] as const;

export function useAlerts() {
  return useQuery({
    queryKey: ALERTS,
    queryFn: async (): Promise<V3Alerts> => {
      const row = await fetchJson<Partial<V3Alerts>>(
        "/api/notification-settings"
      );
      return {
        dailyPlan: row.dailyPlan ?? true,
        dailyPlanTime: row.dailyPlanTime ?? "08:30",
        mailPlan: row.mailPlan ?? false,
        nudges: row.nudges ?? false,
        weeklyReview: row.weeklyReview ?? true,
      };
    },
    staleTime: 5 * 60_000,
  });
}

export function useUpdateAlerts() {
  const qc = useQueryClient();
  return useUndoableMutation<Partial<V3Alerts>, unknown>({
    scope: ALERTS,
    label: "save the notification setting",
    inverse: (_qc, patch) => {
      const cur = qc.getQueryData<V3Alerts>(ALERTS);
      if (!cur) return null;
      const back: Partial<V3Alerts> = {};
      for (const k of Object.keys(patch) as (keyof V3Alerts)[])
        (back as Record<string, unknown>)[k] = cur[k];
      return back;
    },
    optimistic: (client, patch) =>
      client.setQueryData<V3Alerts>(ALERTS, (cur) =>
        cur ? { ...cur, ...patch } : cur
      ),
    request: (patch) => sendJson("/api/notification-settings", "PATCH", patch),
  });
}

/* ---------- billing ---------- */

export type CheckoutChoice =
  | { plan: "pro"; interval: "month" | "year" }
  | { plan: "lifetime" };

/**
 * Start Creem checkout (`POST /api/billing/checkout`) and go to its page.
 * Resolves with the server's error text instead of throwing when checkout is
 * closed (Creem is not configured, lifetime is sold out), so the sheet can
 * say so next to the button.
 */
export async function startCheckout(
  choice: CheckoutChoice
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { url } = await sendJson<{ url: string }>(
      "/api/billing/checkout",
      "POST",
      choice
    );
    window.location.assign(url);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not start checkout.",
    };
  }
}

/** Open the billing portal (`POST /api/billing/portal`): invoices, card, cancel. */
export async function openBillingPortal(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    const { url } = await sendJson<{ url: string }>(
      "/api/billing/portal",
      "POST"
    );
    window.location.assign(url);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not open billing.",
    };
  }
}
