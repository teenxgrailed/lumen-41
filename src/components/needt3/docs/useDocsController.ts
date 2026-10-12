"use client";

import { useCallback, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { useCreateDoc } from "@/lib/needt3/hooks/docs";

import {
  DEFAULT_SORT,
  type DocSort,
  type DocSortKey,
  SORT_STORAGE_KEY,
  nextSort,
  parseSort,
  writeSort,
} from "./sort";

/**
 * The Docs grid's state that must outlive the 700 px swap. `DocsFace` calls
 * this ONCE above the face switch and hands the result to both `DocsPhone`
 * and `DocsScreen`, so crossing the width neither forgets the sort or the
 * Quick Open words (phone only) nor repeats a create: the in-flight guard
 * lives here, and the follow-up (open the new page) runs from this hook, not from a control that may be gone.
 *
 * What stays local to the phone face, and why that loses nothing: the ⋯ menu
 * and the long-press sheet are transient overlays (they close on the swap and
 * hold no data); the pull-down plate's own draft is the kit's local state;
 * the docs list and every write are TanStack Query state, which a swap does
 * not touch.
 */
export type DocsView = "grid" | "masonry" | "list";

export function useDocsController() {
  const router = useRouter();
  const create = useCreateDoc();
  const [sort, setSortState] = useState<DocSort>(DEFAULT_SORT);
  const [q, setQ] = useState("");
  // The desktop grid's layout (grid, cards by length, list); the phone has one.
  const [view, setView] = useState<DocsView>("grid");
  const making = useRef(false);

  /** The stored sort is per browser (`needt.docsSort`): read it after mount
   * (no SSR mismatch) and whenever a face mounts. Nothing stored (or storage
   * blocked) keeps the sort already chosen in this visit. */
  const refreshSort = useCallback(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(SORT_STORAGE_KEY);
    } catch {
      // blocked storage: keep what we have
    }
    if (raw !== null) setSortState(parseSort(raw));
  }, []);

  const setSort = useCallback((key: DocSortKey) => {
    setSortState((cur) => {
      const next = nextSort(cur, key);
      writeSort(next);
      return next;
    });
  }, []);

  /** Create an untitled (or titled) doc and open it; one at a time. */
  const newDoc = useCallback(
    (title = "") => {
      if (making.current) return;
      making.current = true;
      void create
        .mutateAsync({ draft: { title } })
        .then(({ result }) => {
          if (result) router.push(`/pages/${encodeURIComponent(result.id)}`);
        })
        .catch(() => undefined)
        .finally(() => {
          making.current = false;
        });
    },
    [create, router]
  );

  return {
    sort,
    setSort,
    refreshSort,
    q,
    setQ,
    view,
    setView,
    newDoc,
    creating: create.isPending,
  };
}

export type DocsController = ReturnType<typeof useDocsController>;
export type { DocSortKey };
