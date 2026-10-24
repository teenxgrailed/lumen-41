"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";
import type { WhatsNewGroup } from "@/lib/whats-new/compile";
import { SEEN_PREF, type WhatsNewSeen } from "@/lib/whats-new/seen";

import { fetchJson } from "./core";
import { useSetPref } from "./settings";

export interface V3WhatsNew {
  groups: WhatsNewGroup[];
  /** Entry ids not opened yet. */
  unseen: string[];
  marker: WhatsNewSeen | null;
}

/** `GET /api/whats-new`: the feed and what this person has not seen. */
export function useWhatsNew() {
  return useQuery({
    queryKey: qk.whatsNew(),
    queryFn: () => fetchJson<V3WhatsNew>("/api/whats-new"),
    staleTime: 30 * 60_000,
  });
}

/** Whether the account avatar (and the help menu) should carry the dot. */
export function useWhatsNewUnseen() {
  return (useWhatsNew().data?.unseen.length ?? 0) > 0;
}

/**
 * Record that the feed has been read: its newest day goes into
 * `prefs.whatsNewSeen`, and the dot goes at once. The new entries keep their
 * mark in the open sheet (it reads the ids it was opened with).
 */
export function useMarkWhatsNewSeen() {
  const qc = useQueryClient();
  const setPref = useSetPref();
  return () => {
    const cur = qc.getQueryData<V3WhatsNew>(qk.whatsNew());
    if (!cur?.marker || cur.unseen.length === 0) return;
    qc.setQueryData<V3WhatsNew>(qk.whatsNew(), { ...cur, unseen: [] });
    // Not stored (settings not loaded yet, or the write failed and was
    // reported): the dot comes back with the server's answer.
    const again = () => void qc.invalidateQueries({ queryKey: qk.whatsNew() });
    void setPref(SEEN_PREF, cur.marker).then(
      (saved) => (saved === null ? again() : undefined),
      again
    );
  };
}
