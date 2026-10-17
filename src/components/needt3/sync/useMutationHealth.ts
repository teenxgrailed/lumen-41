import { useCallback, useSyncExternalStore } from "react";

import { type Mutation, useQueryClient } from "@tanstack/react-query";

function failedAfterLastSuccess<
  M extends { state: Pick<Mutation["state"], "status" | "submittedAt"> },
>(all: M[]) {
  let lastOk = 0;
  for (const m of all) {
    if (m.state.status === "success")
      lastOk = Math.max(lastOk, m.state.submittedAt);
  }
  return all.filter(
    (m) => m.state.status === "error" && m.state.submittedAt > lastOk
  );
}

/**
 * TanStack Query's mutation state for the sync status: how many are in flight
 * and how many failed with nothing newer succeeding after them.
 */
export function useMutationHealth() {
  const client = useQueryClient();
  const cache = client.getMutationCache();
  const read = useCallback(() => {
    const all = cache.getAll();
    const pending = all.filter((m) => m.state.status === "pending");
    return `${pending.length}:${failedAfterLastSuccess(all).length}`;
  }, [cache]);
  const key = useSyncExternalStore(
    (l) => cache.subscribe(l),
    read,
    () => "0:0"
  );
  const [mutating, failedMutations] = key.split(":").map(Number);
  const retry = useCallback(() => {
    for (const m of failedAfterLastSuccess(cache.getAll())) {
      void m.execute(m.state.variables).catch(() => undefined);
    }
  }, [cache]);
  return { mutating, failedMutations, retry };
}
