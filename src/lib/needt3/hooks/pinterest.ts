"use client";

/**
 * Pinterest for moodboards: whether it is set up and connected
 * (`/api/pinterest/status`), the person's boards (`/api/pinterest/boards`),
 * the import into a moodboard and its "Keep in sync" switch
 * (`/api/moodboards/:id/pinterest`). Connecting is a browser redirect to
 * `/api/pinterest/authorize`.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

import { boardItemsKey } from "./boards";
import { ApiError, fetchJson, sendJson } from "./core";

export interface PinterestStatus {
  /** The server has a Pinterest app (PINTEREST_CLIENT_ID / SECRET). */
  configured: boolean;
  /** The plan includes Pinterest (Pro, trial, Lifetime). */
  pro: boolean;
  connected: boolean;
  /** Pinterest ended the access; connecting again fixes it. */
  needsReconnect: boolean;
  username: string | null;
}

export interface PinterestBoardRow {
  id: string;
  name: string;
  pinCount: number | null;
  privacy: string | null;
}

export interface PinterestImportResult {
  imported: number;
  skipped: number;
  failed: number;
  full: boolean;
}

const STATUS_KEY = [...qk.connections(), "pinterest"] as const;

export function usePinterestStatus() {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => fetchJson<PinterestStatus>("/api/pinterest/status"),
    staleTime: 30_000,
  });
}

export function usePinterestBoards(enabled: boolean) {
  return useQuery({
    queryKey: [...STATUS_KEY, "boards"],
    queryFn: async () =>
      (
        await fetchJson<{ boards: PinterestBoardRow[] }>(
          "/api/pinterest/boards"
        )
      ).boards,
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/** What a failed Pinterest call means for the person, by the status the route sent. */
export function pinterestFailure(error: unknown): {
  kind: "pro" | "reconnect" | "not_approved" | "busy" | "other";
  message: string;
} {
  if (error instanceof ApiError) {
    if (error.status === 402) return { kind: "pro", message: error.message };
    if (error.status === 401)
      return { kind: "reconnect", message: error.message };
    if (error.status === 429) return { kind: "busy", message: error.message };
    if (error.status === 403 && /approved/i.test(error.message))
      return { kind: "not_approved", message: error.message };
    return { kind: "other", message: error.message };
  }
  return { kind: "other", message: "Could not reach Pinterest." };
}

/** Go to Pinterest's consent page and come back to this moodboard. */
export function connectPinterest(moodboardId?: string) {
  const q = moodboardId ? `?moodboard=${encodeURIComponent(moodboardId)}` : "";
  window.location.assign(`/api/pinterest/authorize${q}`);
}

export function usePinterestImport() {
  const qc = useQueryClient();
  return {
    importBoard: async (
      moodboardId: string,
      pinterestBoardId: string,
      keepInSync: boolean
    ) => {
      const result = await sendJson<PinterestImportResult>(
        `/api/moodboards/${moodboardId}/pinterest`,
        "POST",
        { pinterestBoardId, keepInSync }
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: boardItemsKey(moodboardId) }),
        qc.invalidateQueries({ queryKey: qk.boards() }),
        qc.invalidateQueries({ queryKey: qk.board(moodboardId) }),
      ]);
      return result;
    },
    setKeepInSync: async (moodboardId: string, keepInSync: boolean) => {
      await sendJson(`/api/moodboards/${moodboardId}/pinterest`, "PATCH", {
        keepInSync,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.boards() }),
        qc.invalidateQueries({ queryKey: qk.board(moodboardId) }),
      ]);
    },
  };
}
