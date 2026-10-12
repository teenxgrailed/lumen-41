"use client";

import { useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

import { fetchJson } from "./core";

export type V3SearchKind = "task" | "project" | "event";

export interface V3SearchResult {
  id: string;
  kind: V3SearchKind;
  title: string;
  /** Where the result opens in the v3 frame. */
  href: string;
}

interface ApiSearchResult {
  id: string;
  type: "Task" | "Project" | "Event";
  title: string;
  href: string;
}

const KIND: Record<ApiSearchResult["type"], V3SearchKind> = {
  Task: "task",
  Project: "project",
  Event: "event",
};

/**
 * `/api/search` answers with the old shell's links (projects → `/tasks`).
 * v3 has a project page, so the link is rebuilt here instead of in the route,
 * which the flag-off shell still reads.
 */
export function v3SearchHref(row: ApiSearchResult): string {
  if (row.type === "Project") return `/projects/${encodeURIComponent(row.id)}`;
  if (row.type === "Task") return `/tasks?task=${encodeURIComponent(row.id)}`;
  return row.href;
}

export function searchResultFromApi(row: ApiSearchResult): V3SearchResult {
  return {
    id: row.id,
    kind: KIND[row.type],
    title: row.title,
    href: v3SearchHref(row),
  };
}

/** Global search for the ⌘K palette. Empty or 1-char queries do not fetch. */
export function useSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: qk.search(q),
    enabled: q.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const body = await fetchJson<{ results: ApiSearchResult[] }>(
        `/api/search?q=${encodeURIComponent(q)}`
      );
      return body.results.map(searchResultFromApi);
    },
  });
}
