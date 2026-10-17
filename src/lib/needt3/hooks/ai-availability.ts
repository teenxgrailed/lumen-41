"use client";

import { useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

import { fetchJson } from "./core";

/** What `GET /api/ai-settings` says about whether any AI can answer. */
interface ApiAiSettings {
  hostedAvailable?: boolean;
  hasApiKey?: boolean;
  oauth?: { connected?: boolean };
}

/**
 * Whether anything can answer an AI request for this person: Needt's hosted
 * key (the operator's switch: `NEEDT_AI_API_KEY`), a key of their own, or a
 * connected custom sign-in. False means "AI is temporarily unavailable"; the
 * monthly allowance running out is a different state (`aiExhausted`). A
 * failed read answers true, so a hiccup never claims an outage.
 */
export function useAiAvailable() {
  return useQuery({
    queryKey: qk.aiAvailability(),
    queryFn: async () => {
      const s = await fetchJson<ApiAiSettings>("/api/ai-settings");
      return Boolean(s.hostedAvailable || s.hasApiKey || s.oauth?.connected);
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}
