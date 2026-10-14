"use client";

/**
 * Templates and Shared (places.jsx). Both read existing routes:
 * `/api/page-templates` (own templates) and `/api/pages` (every page the
 * person can open, each with an `accessRole`).
 */
import { useQuery } from "@tanstack/react-query";

import { blocksOf, builtinTemplate } from "@/lib/needt3/builtin-templates";
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
    // The built-in set (places.jsx `TEMPLATES`) lives in `builtin-templates.ts`
    // and is made through `useCreateFromBuiltin`; this lists saved ones only.
    //todo: there is no "New template" flow (a template is picked, not made, here).
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

/**
 * Make a page from a built-in template: `POST /api/pages` with the template's
 * title and page colour, then `PUT /api/pages/:id/blocks` with its blocks.
 * Two plain calls, so any client can do the same. If the blocks do not save,
 * the empty page is sent to Trash again rather than left behind. Undo sends
 * the page to Trash.
 */
export function useCreateFromBuiltin() {
  return useUndoableMutation<
    { builtinId: string; title: string } | { trashId: string },
    V3Doc | null
  >({
    scope: qk.docs(),
    label: "create the page",
    inverseFromResult: true,
    inverse: (_qc, vars, result) =>
      "builtinId" in vars && result ? { trashId: result.id } : null,
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
      const template = builtinTemplate(vars.builtinId);
      if (!template) throw new Error("Unknown template");
      const { page } = await sendJson<{ page: ApiPage }>("/api/pages", "POST", {
        title: vars.title,
        style: template.style,
      });
      try {
        await sendJson(`/api/pages/${page.id}/blocks`, "PUT", {
          blocks: blocksOf(template.body),
        });
      } catch (error) {
        try {
          await sendJson(`/api/pages/${page.id}`, "PATCH", { trashed: true });
        } catch {
          /* the page stays; the error below is the one to report */
        }
        throw error;
      }
      return docFromApi({ ...page, style: template.style });
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
