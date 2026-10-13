"use client";

/**
 * Templates and Shared (places.jsx). Both read existing routes:
 * `/api/page-templates` (own templates) and `/api/pages` (every page the
 * person can open, each with an `accessRole`).
 */
import { useQuery } from "@tanstack/react-query";

import { type ApiPage, type V3Doc, docFromApi } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";
import { isSharedWithMe } from "@/lib/needt3/shared";

import { dropListItem, fetchJson, sendJson, useUndoableMutation } from "./core";

export interface V3Template {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string | null;
}

interface ApiTemplate {
  id: string;
  name: string;
  description?: string | null;
  updatedAt?: string;
}

/** The person's own templates, newest first (`GET /api/page-templates`). */
export function useTemplates() {
  return useQuery({
    queryKey: qk.templates(),
    queryFn: async (): Promise<V3Template[]> =>
      (
        await fetchJson<{ templates: ApiTemplate[] }>("/api/page-templates")
      ).templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description ?? null,
        updatedAt: t.updatedAt ?? null,
      })),
    //todo: the built-in set (places.jsx `TEMPLATES`) has no server home;
    // only saved templates are listed, and there is no "New template" flow.
  });
}

/**
 * Make a page from a template (`POST /api/page-templates/:id/instantiate`).
 * Resolves to the new page; undo sends it to Trash.
 */
export function useCreateFromTemplate() {
  return useUndoableMutation<
    { templateId: string; title: string } | { trashId: string },
    V3Doc | null
  >({
    scope: qk.docs(),
    label: "create the page",
    inverseFromResult: true,
    inverse: (_qc, vars, result) =>
      "templateId" in vars && result ? { trashId: result.id } : null,
    optimistic: (qc, vars) => {
      if ("trashId" in vars) dropListItem<V3Doc>(qc, qk.docs(), vars.trashId);
    },
    request: async (vars) => {
      if ("trashId" in vars) {
        await sendJson(`/api/pages/${vars.trashId}`, "PATCH", {
          trashed: true,
        });
        return null;
      }
      const { page } = await sendJson<{ page: ApiPage }>(
        `/api/page-templates/${vars.templateId}/instantiate`,
        "POST",
        { title: vars.title }
      );
      return docFromApi(page);
    },
  });
}

export interface V3SharedDoc {
  doc: V3Doc;
  /** `VIEWER` | `EDITOR` | `FULL_ACCESS`, from the list route. */
  role: string;
}

/**
 * Pages other people own and explicitly shared with the person (the list
 * route's `sharedWithMe`, computed from grants). The list route does not
 * say who shared a page, so there is no "from <name>" yet.
 * //todo: owner name and the date it was shared (needs the owner on `GET /api/pages`).
 */
export function useSharedDocs() {
  return useQuery({
    queryKey: qk.shared(),
    queryFn: async (): Promise<V3SharedDoc[]> => {
      const { pages } = await fetchJson<{
        pages: (ApiPage & {
          accessRole?: string | null;
          sharedWithMe?: boolean;
        })[];
      }>("/api/pages");
      return pages
        .filter(isSharedWithMe)
        .map((p) => ({ doc: docFromApi(p), role: p.accessRole ?? "VIEWER" }));
    },
  });
}
