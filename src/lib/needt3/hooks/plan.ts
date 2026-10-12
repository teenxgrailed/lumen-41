"use client";

import { useQuery } from "@tanstack/react-query";

import { calendarDayDifference, newDate } from "@/lib/date-utils";
import { qk } from "@/lib/needt3/query-keys";

import { fetchJson } from "./core";

/** `GET /api/billing`, the fields the paywall and account banners read. */
export interface ApiBilling {
  configured: boolean;
  plan: string;
  isTrial: boolean;
  trialEndsAt: string | null;
  status: string;
  interval: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canManageBilling: boolean;
  lifetimeAvailable: boolean;
  /** Lifetime seats still open (cap minus buyers and holds); null if unknown. */
  lifetimeLeft?: number | null;
  /** The `billing_checkout` switch; absent means checkout is closed. */
  checkoutEnabled?: boolean;
}

export type V3PlanKind = "free" | "trial" | "monthly" | "yearly" | "lifetime";

export interface V3Plan extends ApiBilling {
  kind: V3PlanKind;
  /** Whole days left in the trial, or null outside one. */
  trialDaysLeft: number | null;
  paymentFailed: boolean;
}

/** The plan as the prototype names it (paywall.jsx): free | trial | monthly | yearly | lifetime. */
export function planKind(
  b: Pick<ApiBilling, "plan" | "isTrial" | "interval">
): V3PlanKind {
  if (b.plan === "LIFETIME") return "lifetime";
  if (b.isTrial) return "trial";
  if (b.plan === "PRO") return b.interval === "year" ? "yearly" : "monthly";
  return "free";
}

export function usePlan() {
  return useQuery({
    queryKey: qk.plan(),
    queryFn: async (): Promise<V3Plan> => {
      const b = await fetchJson<ApiBilling>("/api/billing");
      const kind = planKind(b);
      return {
        ...b,
        kind,
        trialDaysLeft:
          kind === "trial" && b.trialEndsAt
            ? Math.max(
                0,
                calendarDayDifference(newDate(b.trialEndsAt), newDate())
              )
            : null,
        paymentFailed: b.status === "PAYMENT_FAILED" || b.status === "PAST_DUE",
      };
    },
    staleTime: 5 * 60_000,
  });
}

/** `GET /api/needt/shell`: the sidebar's people, pinned docs and task counts. */
export function useShell() {
  return useQuery({
    queryKey: qk.shell(),
    queryFn: () => fetchJson<Record<string, unknown>>("/api/needt/shell"),
  });
}
