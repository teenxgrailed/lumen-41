"use client";

import { useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";
import type {
  ApiSavedView,
  SavedViewQuery,
  SavedViewVisibility,
} from "@/lib/needt3/saved-task-views";

import {
  dropListItem,
  fetchJson,
  findListItem,
  patchListItem,
  sendJson,
  useUndoableMutation,
} from "./core";

const VIEWS = qk.savedViews();

/**
 * Saved views over tasks: the person's own and the ones shared with the
 * workspace (`GET /api/saved-views?resource=TASKS`), in their order.
 */
export function useSavedViews() {
  return useQuery({
    queryKey: VIEWS,
    queryFn: async () =>
      (
        await fetchJson<{ views: ApiSavedView[] }>(
          "/api/saved-views?resource=TASKS"
        )
      ).views,
  });
}

export interface SavedViewDraft {
  name: string;
  visibility: SavedViewVisibility;
  query: SavedViewQuery;
  position: number;
}

const bodyOf = (d: SavedViewDraft) => ({
  name: d.name,
  visibility: d.visibility,
  position: d.position,
  ...d.query,
});

/** Save a view; undo removes it again. */
export function useCreateSavedView() {
  return useUndoableMutation<
    { draft: SavedViewDraft } | { removeId: string },
    ApiSavedView | null
  >({
    scope: VIEWS,
    label: "save the view",
    inverseFromResult: true,
    inverse: (_qc, vars, result) =>
      "draft" in vars && result ? { removeId: result.id } : null,
    optimistic: (qc, vars) => {
      if ("removeId" in vars)
        dropListItem<ApiSavedView>(qc, VIEWS, vars.removeId);
    },
    request: async (vars) => {
      if ("removeId" in vars) {
        await sendJson<void>(`/api/saved-views/${vars.removeId}`, "DELETE");
        return null;
      }
      return (
        await sendJson<{ view: ApiSavedView }>(
          "/api/saved-views",
          "POST",
          bodyOf(vars.draft)
        )
      ).view;
    },
  });
}

/** Rename a view (or change who sees it); undo puts the old values back. */
export function useUpdateSavedView() {
  return useUndoableMutation<
    {
      id: string;
      patch: Partial<Pick<ApiSavedView, "name" | "visibility">>;
    },
    ApiSavedView
  >({
    scope: VIEWS,
    label: "change the view",
    inverse: (qc, { id, patch }) => {
      const cur = findListItem<ApiSavedView>(qc, VIEWS, id);
      if (!cur) return null;
      const back: Partial<Pick<ApiSavedView, "name" | "visibility">> = {};
      if (patch.name !== undefined) back.name = cur.name;
      if (patch.visibility !== undefined) back.visibility = cur.visibility;
      return { id, patch: back };
    },
    optimistic: (qc, { id, patch }) =>
      patchListItem<ApiSavedView>(qc, VIEWS, id, (v) => ({ ...v, ...patch })),
    request: async ({ id, patch }) =>
      (
        await sendJson<{ view: ApiSavedView }>(
          `/api/saved-views/${id}`,
          "PATCH",
          patch
        )
      ).view,
  });
}

/**
 * Delete a view. The server archives the row; undo saves it again with the
 * same name, query and place (a new id).
 */
export function useDeleteSavedView() {
  return useUndoableMutation<
    { view: ApiSavedView } | { restore: SavedViewDraft },
    ApiSavedView | null
  >({
    scope: VIEWS,
    label: "delete the view",
    inverse: (_qc, vars) =>
      "view" in vars
        ? {
            restore: {
              name: vars.view.name,
              visibility: vars.view.visibility,
              position: vars.view.position,
              query: {
                resource: "TASKS",
                type: "list",
                queryVersion: 1,
                groupBy: (vars.view.groupBy ??
                  "date") as SavedViewQuery["groupBy"],
                filters: (vars.view.filters ?? []) as SavedViewQuery["filters"],
                sort: (vars.view.sort ?? []) as SavedViewQuery["sort"],
              },
            },
          }
        : null,
    optimistic: (qc, vars) => {
      if ("view" in vars) dropListItem<ApiSavedView>(qc, VIEWS, vars.view.id);
    },
    request: async (vars) => {
      if ("view" in vars) {
        await sendJson<void>(`/api/saved-views/${vars.view.id}`, "DELETE");
        return null;
      }
      return (
        await sendJson<{ view: ApiSavedView }>(
          "/api/saved-views",
          "POST",
          bodyOf(vars.restore)
        )
      ).view;
    },
  });
}
