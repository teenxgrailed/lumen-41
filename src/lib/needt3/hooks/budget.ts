"use client";

import { useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

import { fetchJson } from "./core";

/** Whether the Budget place exists for this person (`GET /api/budget/nav`). */
export interface BudgetNav {
  enabled: boolean;
}

const OFF: BudgetNav = { enabled: false };

export function useBudgetNav(): BudgetNav {
  const query = useQuery({
    queryKey: qk.budgetNav(),
    queryFn: () => fetchJson<BudgetNav>("/api/budget/nav"),
    staleTime: 5 * 60_000,
    // A failed read hides the item rather than guessing it into view.
    retry: false,
  });
  return query.data ?? OFF;
}
