"use client";

import { useEffect } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type ApiPage,
  type V3Doc,
  docFromApi,
  previewFromApi,
} from "@/lib/needt3/map";
import {
  PAGE_PATCHED_EVENT,
  PAGE_PREVIEW_EVENT,
  type PagePatchedDetail,
  type PagePreviewDetail,
  docFieldsOf,
} from "@/lib/needt3/page-events";
import { type DocsSort, qk } from "@/lib/needt3/query-keys";

import {
  dropListItem,
  fetchJson,
  findListItem,
  patchListItem,
  previousFields,
  sendJson,
  useUndoableMutation,
} from "./core";

const DOCS = qk.docs();

function sortDocs(list: V3Doc[], sort: DocsSort) {
  const by = {
    updated: (a: V3Doc, b: V3Doc) =>
      (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
    //todo: "viewed" needs PageView reads (migration M2); until then it is "updated".
    viewed: (a: V3Doc, b: V3Doc) =>
      (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
    created: (a: V3Doc, b: V3Doc) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    title: (a: V3Doc, b: V3Doc) => a.title.localeCompare(b.title),
  }[sort];
  return [...list].sort(by);
}

/** Live documents (`GET /api/pages`), sorted the way the docs grid asks. */
export function useDocs(sort: DocsSort = "updated") {
  return useQuery({
    queryKey: qk.docs(sort),
    queryFn: async () => {
      const { pages } = await fetchJson<{ pages: ApiPage[] }>("/api/pages");
      return sortDocs(pages.map(docFromApi), sort);
    },
  });
}

export function useDoc(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.doc(id ?? ""),
    enabled: !!id,
    queryFn: async () => {
      const { page } = await fetchJson<{ page: ApiPage }>(`/api/pages/${id}`);
      return docFromApi(page);
    },
  });
}

/**
 * Keep the cached document and every cached list in step with what the
 * editor writes (title, icon, pin, cover): it announces each patch, this
 * applies it, so the breadcrumb and the rail follow as you type.
 */
export function usePageEditSync(id: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!id) return undefined;
    const on = (event: Event) => {
      const detail = (event as CustomEvent<PagePatchedDetail>).detail;
      if (!detail || detail.pageId !== id || detail.from === "chrome") return;
      const patch = docFieldsOf(detail.values);
      if (!Object.keys(patch).length) return;
      qc.setQueryData<V3Doc>(qk.doc(id), (cur) =>
        cur ? { ...cur, ...patch } : cur
      );
      patchListItem<V3Doc>(qc, DOCS, id, (d) => ({ ...d, ...patch }));
    };
    window.addEventListener(PAGE_PATCHED_EVENT, on);
    return () => window.removeEventListener(PAGE_PATCHED_EVENT, on);
  }, [id, qc]);
}

/**
 * Keep the first lines of every edited page current in the cached document
 * and every cached list (Docs grid, Pinned faces, rail thumb). The editor
 * announces them after a pause in typing and once more as it is left, which
 * is why this is mounted in the shell (it outlives the document screen) and
 * not next to the editor.
 */
export function useLivePreviews() {
  const qc = useQueryClient();
  useEffect(() => {
    const on = (event: Event) => {
      const detail = (event as CustomEvent<PagePreviewDetail>).detail;
      if (!detail || typeof detail.pageId !== "string") return;
      const preview = previewFromApi(detail.preview);
      if (!preview) return;
      const id = detail.pageId;
      qc.setQueryData<V3Doc>(qk.doc(id), (cur) =>
        cur ? { ...cur, preview } : cur
      );
      patchListItem<V3Doc>(qc, DOCS, id, (d) => ({ ...d, preview }));
    };
    window.addEventListener(PAGE_PREVIEW_EVENT, on);
    return () => window.removeEventListener(PAGE_PREVIEW_EVENT, on);
  }, [qc]);
}

type DocPatch = Partial<
  Pick<
    V3Doc,
    "title" | "icon" | "coverUrl" | "isFavorite" | "projectId" | "style"
  >
>;

/** Patch a document's chrome (title, cover, pin, project, style). */
export function useUpdateDoc() {
  return useUndoableMutation<{ id: string; patch: DocPatch }, V3Doc>({
    scope: [DOCS, qk.doc("").slice(0, 2)],
    label: "update the document",
    inverse: (qc, { id, patch }) => {
      const cur =
        findListItem<V3Doc>(qc, DOCS, id) ?? qc.getQueryData<V3Doc>(qk.doc(id));
      return cur ? { id, patch: previousFields(cur, patch) } : null;
    },
    optimistic: (qc, { id, patch }) => {
      patchListItem<V3Doc>(qc, DOCS, id, (d) => ({ ...d, ...patch }));
      qc.setQueryData<V3Doc>(qk.doc(id), (d) => (d ? { ...d, ...patch } : d));
    },
    request: async ({ id, patch }) =>
      docFromApi(
        (await sendJson<{ page: ApiPage }>(`/api/pages/${id}`, "PATCH", patch))
          .page
      ),
  });
}

/** Trash and restore a document; each undoes the other. */
export function useTrashDoc() {
  return useUndoableMutation<{ id: string; trashed: boolean }, unknown>({
    scope: [DOCS, qk.trash()],
    label: "move the document",
    inverse: (_qc, { id, trashed }) => ({ id, trashed: !trashed }),
    optimistic: (qc, { id, trashed }) => {
      if (trashed) dropListItem<V3Doc>(qc, DOCS, id);
    },
    request: ({ id, trashed }) =>
      sendJson(`/api/pages/${id}`, "PATCH", { trashed }),
  });
}

/** Create a document. Undo moves it to Trash. */
export function useCreateDoc() {
  return useUndoableMutation<
    | {
        draft: {
          title?: string;
          projectId?: string | null;
          style?: Record<string, unknown>;
        };
      }
    | { trashId: string },
    V3Doc | null
  >({
    scope: DOCS,
    label: "create the document",
    inverseFromResult: true,
    inverse: (_qc, vars, result) =>
      "draft" in vars && result ? { trashId: result.id } : null,
    optimistic: (qc, vars) => {
      if ("trashId" in vars) dropListItem<V3Doc>(qc, DOCS, vars.trashId);
    },
    request: async (vars) => {
      if ("trashId" in vars) {
        await sendJson(`/api/pages/${vars.trashId}`, "PATCH", {
          trashed: true,
        });
        return null;
      }
      return docFromApi(
        (await sendJson<{ page: ApiPage }>("/api/pages", "POST", vars.draft))
          .page
      );
    },
  });
}

export interface V3Template {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
}

/** The person's own templates; built-ins are code constants. */
export function useTemplates() {
  return useQuery({
    queryKey: qk.templates(),
    queryFn: async () =>
      (await fetchJson<{ templates: V3Template[] }>("/api/page-templates"))
        .templates,
  });
}
