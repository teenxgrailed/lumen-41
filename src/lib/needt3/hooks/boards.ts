"use client";

import { useQuery } from "@tanstack/react-query";

import { newDate } from "@/lib/date-utils";
import {
  type ApiMoodboard,
  type V3Board,
  boardFromApi,
} from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";

import {
  dropListItem,
  fetchJson,
  findListItem,
  isBoardFull,
  patchListItem,
  previousFields,
  sendJson,
  useUndoableMutation,
} from "./core";

const BOARDS = qk.boards();

/**
 * Moodboards. The list carries trashed boards too (`trashedAt` set), so the
 * grid filters with `!trashedAt` and Trash with `trashedAt`.
 */
export function useBoards() {
  return useQuery({
    queryKey: BOARDS,
    // The grid's covers come from the list; items change on the board's own
    // page, so a return to the grid reads the list again.
    staleTime: 0,
    queryFn: async () =>
      (
        await fetchJson<{ moodboards: ApiMoodboard[] }>("/api/moodboards")
      ).moodboards.map(boardFromApi),
  });
}

export function useBoard(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.board(id ?? ""),
    enabled: !!id,
    queryFn: async () =>
      boardFromApi(
        (await fetchJson<{ moodboard: ApiMoodboard }>(`/api/moodboards/${id}`))
          .moodboard
      ),
  });
}

type BoardPatch = Partial<
  Pick<V3Board, "title" | "projectId" | "linkShare" | "pinterestBoardId">
>;

export function useUpdateBoard() {
  return useUndoableMutation<{ id: string; patch: BoardPatch }, V3Board>({
    scope: BOARDS,
    label: "update the board",
    inverse: (qc, { id, patch }) => {
      const cur = findListItem<V3Board>(qc, BOARDS, id);
      return cur ? { id, patch: previousFields(cur, patch) } : null;
    },
    optimistic: (qc, { id, patch }) =>
      patchListItem<V3Board>(qc, BOARDS, id, (b) => ({ ...b, ...patch })),
    request: async ({ id, patch }) =>
      boardFromApi(
        (
          await sendJson<{ moodboard: ApiMoodboard }>(
            `/api/moodboards/${id}`,
            "PATCH",
            patch
          )
        ).moodboard
      ),
  });
}

/** Trash and restore a board; each undoes the other. */
export function useTrashBoard() {
  return useUndoableMutation<{ id: string; trashed: boolean }, unknown>({
    scope: BOARDS,
    label: "move the board",
    inverse: (_qc, { id, trashed }) => ({ id, trashed: !trashed }),
    optimistic: (qc, { id, trashed }) =>
      patchListItem<V3Board>(qc, BOARDS, id, (b) => ({
        ...b,
        trashedAt: trashed ? (b.trashedAt ?? newDate().toISOString()) : null,
      })),
    request: ({ id, trashed }) =>
      sendJson(`/api/moodboards/${id}`, "PATCH", { trashed }),
  });
}

/** Create a board. Undo moves it to Trash. */
export function useCreateBoard() {
  return useUndoableMutation<
    | { draft: { title?: string; projectId?: string | null } }
    | { trashId: string },
    V3Board | null
  >({
    scope: BOARDS,
    label: "create the board",
    inverseFromResult: true,
    inverse: (_qc, vars, result) =>
      "draft" in vars && result ? { trashId: result.id } : null,
    optimistic: (qc, vars) => {
      if ("trashId" in vars) dropListItem<V3Board>(qc, BOARDS, vars.trashId);
    },
    request: async (vars) => {
      if ("trashId" in vars) {
        await sendJson(`/api/moodboards/${vars.trashId}`, "PATCH", {
          trashed: true,
        });
        return null;
      }
      return boardFromApi(
        (
          await sendJson<{ moodboard: ApiMoodboard }>(
            "/api/moodboards",
            "POST",
            vars.draft
          )
        ).moodboard
      );
    },
  });
}

/* ---------- a board's references (MoodboardItem, /api/moodboards/[id]/items) ---------- */

export type V3BoardItemKind = "image" | "link" | "color" | "note";
const ITEM_KINDS: readonly string[] = ["image", "link", "color", "note"];

export interface ApiBoardItem {
  id: string;
  moodboardId?: string;
  kind: string;
  url?: string | null;
  color?: string | null;
  text?: string | null;
  title?: string | null;
  ratio?: number | null;
  colorName?: string | null;
  source?: { name?: string; domain?: string } | null;
  thumbnailUrl?: string | null;
  position?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** A reference on a board's wall. */
export interface V3BoardItem {
  id: string;
  kind: V3BoardItemKind;
  url: string | null;
  color: string | null;
  text: string | null;
  title: string | null;
  ratio: number | null;
  colorName: string | null;
  source: { name?: string; domain?: string } | null;
  thumbnailUrl: string | null;
  position: number;
  createdAt: string | null;
}

export function boardItemFromApi(row: ApiBoardItem): V3BoardItem {
  return {
    id: row.id,
    kind: row.kind as V3BoardItemKind,
    url: row.url ?? null,
    color: row.color ?? null,
    text: row.text ?? null,
    title: row.title ?? null,
    ratio: row.ratio ?? null,
    colorName: row.colorName ?? null,
    source: row.source ?? null,
    thumbnailUrl: row.thumbnailUrl ?? null,
    position: row.position ?? 0,
    createdAt: row.createdAt ?? null,
  };
}

/** What a new reference is made from (a subset of the route's writable fields). */
export interface BoardItemDraft {
  kind: V3BoardItemKind;
  url?: string | null;
  color?: string | null;
  text?: string | null;
  title?: string | null;
  ratio?: number | null;
  colorName?: string | null;
  source?: { name?: string; domain?: string } | null;
  thumbnailUrl?: string | null;
  position?: number;
}

/** Every board's items sit under `[v3, "board"]`; one scope covers them all. */
const BOARD_ITEMS_SCOPE = [qk.boards()[0], "board"] as const;
export const boardItemsKey = (boardId: string) =>
  [...qk.board(boardId), "items"] as const;

/** The draft that would re-make `item` where it was. */
export function draftFromItem(item: V3BoardItem): BoardItemDraft {
  return {
    kind: item.kind,
    position: item.position,
    ...(item.url !== null && { url: item.url }),
    ...(item.color !== null && { color: item.color }),
    ...(item.text !== null && { text: item.text }),
    ...(item.title !== null && { title: item.title }),
    ...(item.ratio !== null && { ratio: item.ratio }),
    ...(item.colorName !== null && { colorName: item.colorName }),
    ...(item.source !== null && { source: item.source }),
    ...(item.thumbnailUrl !== null && { thumbnailUrl: item.thumbnailUrl }),
  };
}

/** A board's references in wall order. Unknown kinds are left out. */
export function useBoardItems(boardId: string | null | undefined) {
  return useQuery({
    queryKey: boardItemsKey(boardId ?? ""),
    enabled: !!boardId,
    queryFn: async () =>
      (
        await fetchJson<{ items: ApiBoardItem[] }>(
          `/api/moodboards/${boardId}/items`
        )
      ).items
        .filter((row) => ITEM_KINDS.includes(row.kind))
        .map(boardItemFromApi),
  });
}

/**
 * Add a reference to the end of the wall; Undo removes it. (The items routes
 * do not read If-Match, so none is sent.)
 */
export function useAddBoardItem() {
  return useUndoableMutation<
    | { boardId: string; draft: BoardItemDraft }
    | { boardId: string; removeId: string },
    V3BoardItem | null
  >({
    scope: BOARD_ITEMS_SCOPE,
    label: "add the reference",
    quiet: isBoardFull, // the caller words it: BOARD_FULL_TEXT
    inverseFromResult: true,
    inverse: (_qc, vars, result) =>
      "draft" in vars && result
        ? { boardId: vars.boardId, removeId: result.id }
        : null,
    optimistic: (qc, vars) => {
      if ("removeId" in vars)
        dropListItem<V3BoardItem>(
          qc,
          boardItemsKey(vars.boardId),
          vars.removeId
        );
    },
    request: async (vars) => {
      if ("removeId" in vars) {
        await sendJson(
          `/api/moodboards/${vars.boardId}/items/${vars.removeId}`,
          "DELETE"
        );
        return null;
      }
      return boardItemFromApi(
        (
          await sendJson<{ item: ApiBoardItem }>(
            `/api/moodboards/${vars.boardId}/items`,
            "POST",
            vars.draft
          )
        ).item
      );
    },
  });
}

/** Remove a reference; Undo puts it back where it was (a new id, the same place). */
export function useRemoveBoardItem() {
  return useUndoableMutation<
    | { boardId: string; id: string }
    | { boardId: string; restore: BoardItemDraft },
    unknown
  >({
    scope: BOARD_ITEMS_SCOPE,
    label: "remove the reference",
    inverse: (qc, vars) => {
      if (!("id" in vars)) return null;
      const cur = findListItem<V3BoardItem>(
        qc,
        boardItemsKey(vars.boardId),
        vars.id
      );
      return cur
        ? { boardId: vars.boardId, restore: draftFromItem(cur) }
        : null;
    },
    optimistic: (qc, vars) => {
      if ("id" in vars)
        dropListItem<V3BoardItem>(qc, boardItemsKey(vars.boardId), vars.id);
    },
    request: async (vars) =>
      "id" in vars
        ? sendJson(`/api/moodboards/${vars.boardId}/items/${vars.id}`, "DELETE")
        : sendJson(
            `/api/moodboards/${vars.boardId}/items`,
            "POST",
            vars.restore
          ),
  });
}
