"use client";

import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { fetchJson, sendJson } from "./core";

/**
 * Comments on one reference of a moodboard (the Detail sheet and the phone
 * item sheet), over `/api/moodboards/:id/items/:itemId/comments`. Anyone who
 * can see the board reads; an editor writes; the author or full access
 * resolves or deletes (the route enforces it).
 */

export interface ItemComment {
  id: string;
  itemId: string;
  authorId: string;
  body: string;
  resolvedAt: string | null;
  createdAt: string;
  author: { name: string | null; email: string | null; image: string | null };
}

export const itemCommentsKey = (boardId: string, itemId: string) =>
  [...qk.board(boardId), "item", itemId, "comments"] as const;

const base = (boardId: string, itemId: string) =>
  `/api/moodboards/${boardId}/items/${itemId}/comments`;

export function useItemComments(
  boardId: string | null | undefined,
  itemId: string | null | undefined,
  enabled = true
) {
  return useQuery({
    queryKey: itemCommentsKey(boardId ?? "", itemId ?? ""),
    enabled: enabled && !!boardId && !!itemId,
    queryFn: async () =>
      (
        await fetchJson<{ comments: ItemComment[] }>(
          base(boardId as string, itemId as string)
        )
      ).comments,
  });
}

function refresh(qc: QueryClient, boardId: string, itemId: string) {
  return qc.invalidateQueries({ queryKey: itemCommentsKey(boardId, itemId) });
}

/** Post, resolve / reopen and delete a comment on one reference. */
export function useItemCommentActions(boardId: string, itemId: string) {
  const qc = useQueryClient();
  const done = () => refresh(qc, boardId, itemId);
  const failed = (message: string) => () => notify.error(message);
  const post = useMutation({
    mutationFn: (body: string) =>
      sendJson(base(boardId, itemId), "POST", { body }),
    onSuccess: done,
    onError: failed("Could not post the comment."),
  });
  const resolve = useMutation({
    mutationFn: (v: { id: string; resolved: boolean }) =>
      sendJson(`${base(boardId, itemId)}/${v.id}`, "PATCH", {
        resolved: v.resolved,
      }),
    onSuccess: done,
    onError: failed("Could not change the comment."),
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      sendJson(`${base(boardId, itemId)}/${id}`, "DELETE"),
    onSuccess: done,
    onError: failed("Could not delete the comment."),
  });
  return { post, resolve, remove };
}
