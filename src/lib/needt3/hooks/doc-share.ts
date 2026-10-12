"use client";

import { useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

import { fetchJson, sendJson, useUndoableMutation } from "./core";

/**
 * Sharing for one document (the Share sheet, T14), over the existing routes:
 * `GET /api/pages/:id` (owner, workspace, my role), `/permissions`
 * (PageAccessGrant), `/api/workspaces/:id/members` (who can be invited) and
 * `/publication` (the public read-only link).
 *
 * Keys hang under `qk.doc(id)`, so invalidating the document refreshes its
 * sharing too.
 */

export type DocRole = "FULL_ACCESS" | "EDITOR" | "VIEWER";

export interface DocAccess {
  ownerId: string;
  workspaceId: string | null;
  myRole: DocRole | null;
}

export interface DocPerson {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export interface DocGrant extends DocPerson {
  role: DocRole;
}

interface ApiPerson {
  userId: string;
  user: { name: string | null; email: string | null; image: string | null };
}

const person = (row: ApiPerson): DocPerson => ({
  userId: row.userId,
  name: row.user?.name ?? null,
  email: row.user?.email ?? null,
  image: row.user?.image ?? null,
});

export const docAccessKey = (id: string) => [...qk.doc(id), "access"] as const;
export const docGrantsKey = (id: string) => [...qk.doc(id), "grants"] as const;
export const docMembersKey = (id: string) =>
  [...qk.doc(id), "members"] as const;
export const docLinkKey = (id: string) =>
  [...qk.doc(id), "publication"] as const;

/** Who owns the page, its workspace, and the reader's own role. */
export function useDocAccess(id: string) {
  return useQuery({
    queryKey: docAccessKey(id),
    queryFn: async (): Promise<DocAccess> => {
      const { page } = await fetchJson<{
        page: {
          userId: string;
          workspaceId?: string | null;
          accessRole?: DocRole | null;
        };
      }>(`/api/pages/${id}`);
      return {
        ownerId: page.userId,
        workspaceId: page.workspaceId ?? null,
        myRole: page.accessRole ?? null,
      };
    },
  });
}

/** People with access (owner excluded). Only a full-access reader may list. */
export function useDocGrants(id: string, enabled: boolean) {
  return useQuery({
    queryKey: docGrantsKey(id),
    enabled,
    queryFn: async () => {
      const res = await fetchJson<{
        ownerId: string;
        grants: (ApiPerson & { role: DocRole })[];
      }>(`/api/pages/${id}/permissions`);
      return res.grants.map((g): DocGrant => ({ ...person(g), role: g.role }));
    },
  });
}

/** The workspace's members: the people an email invite can reach. */
export function useDocInvitees(
  id: string,
  workspaceId: string | null,
  enabled: boolean
) {
  return useQuery({
    queryKey: docMembersKey(id),
    enabled: enabled && !!workspaceId,
    queryFn: async () =>
      (
        await fetchJson<{ members: ApiPerson[] }>(
          `/api/workspaces/${workspaceId}/members`
        )
      ).members.map(person),
  });
}

interface GrantVars {
  pageId: string;
  person: DocPerson;
  /** `null` removes the person's access. */
  role: DocRole | null;
}

/** Give, change or take away one person's access; Undo puts it back. */
export function useSetDocGrant() {
  return useUndoableMutation<GrantVars, unknown>({
    scope: qk.doc("").slice(0, 2),
    label: "change who can open the document",
    inverse: (qc, { pageId, person: p, role }) => {
      const list = qc.getQueryData<DocGrant[]>(docGrantsKey(pageId)) ?? [];
      const was = list.find((g) => g.userId === p.userId)?.role ?? null;
      return was === role ? null : { pageId, person: p, role: was };
    },
    optimistic: (qc, { pageId, person: p, role }) => {
      qc.setQueryData<DocGrant[]>(docGrantsKey(pageId), (list = []) => {
        const rest = list.filter((g) => g.userId !== p.userId);
        if (!role) return rest;
        const at = list.findIndex((g) => g.userId === p.userId);
        const next = { ...p, role };
        if (at < 0) return [...rest, next];
        return list.map((g) => (g.userId === p.userId ? next : g));
      });
    },
    request: ({ pageId, person: p, role }) =>
      role
        ? sendJson(`/api/pages/${pageId}/permissions`, "PUT", {
            userId: p.userId,
            role,
          })
        : sendJson(`/api/pages/${pageId}/permissions`, "DELETE", {
            userId: p.userId,
          }),
  });
}

export interface DocLink {
  published: boolean;
  url: string | null;
}

/** The public read-only link (`PagePublication`). */
export function useDocLink(id: string, enabled: boolean) {
  return useQuery({
    queryKey: docLinkKey(id),
    enabled,
    queryFn: () => fetchJson<DocLink>(`/api/pages/${id}/publication`),
  });
}

interface LinkVars {
  pageId: string;
  on: boolean;
}

/**
 * The step that takes the link back, from the state before the change.
 * Turning the link off revokes its token, and turning it on again mints a new
 * URL, so off has no undo; neither has a change that changes nothing.
 */
export function docLinkInverse(
  before: DocLink | undefined,
  { pageId, on }: LinkVars
): LinkVars | null {
  const was = !!before?.published;
  if (was === on || !on) return null;
  return { pageId, on: false };
}

/** Turn the public link on or off; Undo takes back turning it on. */
export function useSetDocLink() {
  return useUndoableMutation<LinkVars, DocLink>({
    scope: qk.doc("").slice(0, 2),
    label: "change the link",
    inverse: (qc, vars) =>
      docLinkInverse(qc.getQueryData<DocLink>(docLinkKey(vars.pageId)), vars),
    optimistic: (qc, { pageId, on }) => {
      qc.setQueryData<DocLink>(docLinkKey(pageId), (cur) => ({
        published: on,
        url: on ? (cur?.url ?? null) : null,
      }));
    },
    request: ({ pageId, on }) =>
      sendJson<DocLink>(
        `/api/pages/${pageId}/publication`,
        on ? "POST" : "DELETE"
      ),
  });
}
