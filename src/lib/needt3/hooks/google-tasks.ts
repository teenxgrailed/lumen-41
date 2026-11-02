"use client";

/**
 * Google Tasks in Connections: the person's task lists and which of them are
 * imported into a Needt project. Reads and writes go through the public
 * task-sync API (`/api/task-sync/*`), the same one a script or another tool
 * can use.
 */
import { useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

import { ApiError, fetchJson, sendJson } from "./core";

export interface GoogleTaskList {
  id: string;
  name: string;
  isMapped: boolean;
  mappingId?: string;
  projectId?: string;
  projectName?: string;
  lastSyncedAt?: string | null;
}

/** The Tasks grant was revoked or never given: connect again. */
export const REAUTH_MESSAGE = "Google Tasks needs to be reconnected.";

export const googleTasksListsKey = (providerId: string) =>
  [...qk.connections(), "google-tasks-lists", providerId] as const;

/** The Google task lists of one provider, each with its import (mapping) if any. */
export function useGoogleTaskLists(providerId: string | null) {
  return useQuery({
    queryKey: googleTasksListsKey(providerId ?? ""),
    enabled: !!providerId,
    // The lists come from Google, so a stale answer would hide a new list.
    staleTime: 0,
    retry: (count, error) =>
      !(error instanceof ApiError && error.status === 401) && count < 1,
    queryFn: () =>
      fetchJson<GoogleTaskList[]>(
        `/api/task-sync/providers/${providerId}/lists`
      ),
  });
}

type Outcome = { ok: true } | { ok: false; error: string };

const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

/** Import one list into a project. The server starts the first sync. */
export async function importTaskList(input: {
  providerId: string;
  list: Pick<GoogleTaskList, "id" | "name">;
  projectId: string;
}): Promise<Outcome> {
  try {
    await sendJson("/api/task-sync/mappings", "POST", {
      providerId: input.providerId,
      externalListId: input.list.id,
      externalListName: input.list.name || "Tasks",
      projectId: input.projectId,
      direction: "incoming",
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, "Could not import the list") };
  }
}

/** Stop importing a list. The tasks already imported stay in the project. */
export async function stopImportingTaskList(
  mappingId: string
): Promise<Outcome> {
  try {
    await sendJson(`/api/task-sync/mappings/${mappingId}`, "DELETE");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, "Could not stop the import") };
  }
}

/** Disconnect Google Tasks: the provider and its imports go; the tasks stay. */
export async function disconnectGoogleTasks(
  providerId: string
): Promise<Outcome> {
  try {
    await sendJson(`/api/task-sync/providers/${providerId}`, "DELETE");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, "Could not disconnect") };
  }
}

/** Sync the lists that are imported now (`POST /api/task-sync/sync`). */
export async function syncGoogleTasksNow(
  providerId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await sendJson("/api/task-sync/sync", "POST", { providerId });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, "Could not start the sync") };
  }
}
