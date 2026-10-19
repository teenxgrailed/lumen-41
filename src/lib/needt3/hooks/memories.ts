"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

import { fetchJson, sendJson } from "./core";

/**
 * "Let Needt learn about me" and what it has learned (`/api/ai/memories`).
 * The list is readable with the switch off; nothing in it is used then.
 */

export type MemorySource = "chat" | "inferred" | "habit" | "document" | "mail";

export interface Memory {
  id: string;
  kind: "preference" | "pattern" | "goal" | "fact";
  content: string;
  source: MemorySource;
  createdAt: string;
  updatedAt: string;
}

export interface MemoriesState {
  enabled: boolean;
  memories: Memory[];
}

export function useMemories() {
  return useQuery({
    queryKey: qk.memories(),
    queryFn: () => fetchJson<MemoriesState>("/api/ai/memories"),
    staleTime: 30_000,
  });
}

export function useMemoryActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: qk.memories() });
  const setEnabled = useMutation({
    mutationFn: (v: { enabled: boolean; memories?: "keep" | "delete" }) =>
      sendJson("/api/ai/memories", "PATCH", v),
    onSettled: refresh,
  });
  const edit = useMutation({
    mutationFn: (v: { memoryId: string; content: string }) =>
      sendJson("/api/ai/memories", "PATCH", v),
    onSettled: refresh,
  });
  const forget = useMutation({
    mutationFn: (v: { memoryId: string } | { all: true }) =>
      sendJson("/api/ai/memories", "DELETE", v),
    onSettled: refresh,
  });
  return { setEnabled, edit, forget };
}
