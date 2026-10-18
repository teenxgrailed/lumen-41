"use client";

import { useEffect, useRef } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

import { fetchJson, sendJson } from "./core";

/**
 * THE MORNING BRIEF (`/api/ai/morning-brief`), Pro only. Home reads the
 * day's cached brief; when there is none and asking is allowed (a paid plan,
 * the morning, AI that can answer, a day with something in it) it asks the
 * server to write it, once. The server keeps the one-per-day rule; this only
 * avoids asking twice from one screen. Nothing here ever shows an error: a
 * brief that cannot be written is simply not there.
 */

export interface Brief {
  date: string;
  text: string;
  dismissed: boolean;
}

type Outcome =
  | { status: "ready"; brief: Brief }
  | { status: "pending" | "unavailable" | "upgrade"; brief: null };

/** Retry once after this long when another request is still writing it. */
const PENDING_RETRY_MS = 4000;

export function useMorningBrief({
  day,
  ask,
  show,
  facts,
}: {
  day: string;
  /** Allowed to ask the server to write it (a known paid plan, AI available). */
  ask: boolean;
  /** Allowed to read it (a known paid plan). */
  show: boolean;
  facts: unknown;
}) {
  const qc = useQueryClient();
  const key = qk.morningBrief(day);
  const cached = useQuery({
    queryKey: key,
    queryFn: async () =>
      (
        await fetchJson<{ brief: Brief | null }>(
          `/api/ai/morning-brief?date=${encodeURIComponent(day)}`
        )
      ).brief ?? null,
    enabled: show,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const asked = useRef<string | null>(null);
  const retried = useRef(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const write = useMutation({
    mutationFn: () =>
      sendJson<Outcome>("/api/ai/morning-brief", "POST", { date: day, facts }),
    onSuccess: (out) => {
      if (out.status === "ready") qc.setQueryData(key, out.brief);
      else if (out.status === "pending" && !retried.current) {
        retried.current = true;
        timer.current = window.setTimeout(
          () => void qc.invalidateQueries({ queryKey: key }),
          PENDING_RETRY_MS
        );
      }
    },
  });

  const { mutate } = write;
  const fetched = cached.isFetched && !cached.isError;
  const missing = fetched && cached.data == null;
  useEffect(() => {
    if (!ask || !missing || asked.current === day) return;
    asked.current = day;
    mutate();
  }, [ask, missing, day, mutate]);

  const dismiss = useMutation({
    mutationFn: () =>
      sendJson("/api/ai/morning-brief", "PATCH", {
        date: day,
        dismissed: true,
      }),
    onMutate: () => {
      const before = qc.getQueryData<Brief | null>(key);
      if (before)
        qc.setQueryData<Brief | null>(key, { ...before, dismissed: true });
      return { before };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(key, ctx?.before ?? null),
  });

  const brief = show ? (cached.data ?? null) : null;
  return {
    brief: brief && !brief.dismissed ? brief : null,
    dismiss: () => dismiss.mutate(),
  };
}
