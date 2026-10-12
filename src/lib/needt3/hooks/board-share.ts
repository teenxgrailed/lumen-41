"use client";

import { useQuery } from "@tanstack/react-query";

import type { BoardRole } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";

import { fetchJson, sendJson, useUndoableMutation } from "./core";

/**
 * Sharing for one moodboard (the Share sheet, both faces), over
 * `/api/moodboards/:id/permissions` (`MoodboardAccessGrant`): who is on it,
 * give / change / take away a role. The route enforces the roles: only full
 * access may change anything, and an invite reaches people already in the
 * workspace (nobody is emailed). "Anyone with the link" is `useUpdateBoard`'s
 * `linkShare`.
 */

export interface BoardPerson {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
}
export interface BoardGrant extends BoardPerson {
  role: BoardRole;
}
export interface BoardAccess {
  creatorId: string | null;
  creator: {
    name: string | null;
    email: string | null;
    image: string | null;
  } | null;
  linkShare: boolean;
  myRole: BoardRole;
  grants: BoardGrant[];
  /** Workspace members an invite can reach (full access only). */
  candidates: BoardPerson[];
}

interface ApiPerson {
  userId: string;
  user: { name: string | null; email: string | null; image: string | null };
}
const person = (row: ApiPerson): BoardPerson => ({
  userId: row.userId,
  name: row.user?.name ?? null,
  email: row.user?.email ?? null,
  image: row.user?.image ?? null,
});

export const boardAccessKey = (id: string) =>
  [...qk.board(id), "access"] as const;

/** Who is on the board and what the reader may do about it. */
export function useBoardAccess(id: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: boardAccessKey(id ?? ""),
    enabled: enabled && !!id,
    queryFn: async (): Promise<BoardAccess> => {
      const res = await fetchJson<{
        creatorId: string | null;
        creator: BoardAccess["creator"];
        linkShare: boolean;
        myRole: BoardRole;
        grants: (ApiPerson & { role: BoardRole })[];
        candidates: ApiPerson[];
      }>(`/api/moodboards/${id}/permissions`);
      return {
        creatorId: res.creatorId,
        creator: res.creator,
        linkShare: res.linkShare,
        myRole: res.myRole,
        grants: res.grants.map((g) => ({ ...person(g), role: g.role })),
        candidates: res.candidates.map(person),
      };
    },
  });
}

interface GrantVars {
  boardId: string;
  person: BoardPerson;
  /** `null` takes the person off the board. */
  role: BoardRole | null;
}

/** Give, change or take away one person's role; Undo puts it back. */
export function useSetBoardGrant() {
  return useUndoableMutation<GrantVars, unknown>({
    scope: qk.board("").slice(0, 2),
    label: "change who can open the board",
    inverse: (qc, { boardId, person: p, role }) => {
      const cur = qc.getQueryData<BoardAccess>(boardAccessKey(boardId));
      const was = cur?.grants.find((g) => g.userId === p.userId)?.role ?? null;
      return was === role ? null : { boardId, person: p, role: was };
    },
    optimistic: (qc, { boardId, person: p, role }) => {
      qc.setQueryData<BoardAccess>(boardAccessKey(boardId), (cur) => {
        if (!cur) return cur;
        const rest = cur.grants.filter((g) => g.userId !== p.userId);
        if (!role) return { ...cur, grants: rest };
        const at = cur.grants.findIndex((g) => g.userId === p.userId);
        const next = { ...p, role };
        return {
          ...cur,
          grants:
            at < 0
              ? [...rest, next]
              : cur.grants.map((g) => (g.userId === p.userId ? next : g)),
        };
      });
    },
    request: ({ boardId, person: p, role }) =>
      role
        ? sendJson(`/api/moodboards/${boardId}/permissions`, "PUT", {
            userId: p.userId,
            role,
          })
        : sendJson(`/api/moodboards/${boardId}/permissions`, "DELETE", {
            userId: p.userId,
          }),
  });
}
