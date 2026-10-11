"use client";

import { useCallback, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { useCreateDoc } from "@/lib/needt3/hooks/docs";

import {
  DEFAULT_SORT,
  type DocSort,
  type DocSortKey,
  nextSort,
  readSort,
  writeSort,
} from "../../docs/sort";

/**
 * The phone Docs home's state that must outlive the 700 px swap. `DocsFace`
 * calls this ONCE above the face switch and hands the result to `DocsPhone`,
 * so crossing the width neither forgets the Quick Open words or the sort nor
 * repeats a create: the in-flight guard lives here, and the follow-up (open
 * the new page) runs from this hook, not from a control that may be gone.
 *
 * What stays local to the phone face, and why that loses nothing: the ⋯ menu
 * and the long-press sheet are transient overlays (they close on the swap and
 * hold no data); the pull-down plate's own draft is the kit's local state;
 * the docs list and every write are TanStack Query state, which a swap does
 * not touch.
 */
export function useDocsPhone() {
  const router = useRouter();
  const create = useCreateDoc();
  const [sort, setSortState] = useState<DocSort>(DEFAULT_SORT);
  const [q, setQ] = useState("");
  const making = useRef(false);

  /** The stored sort is per browser and shared with the desktop grid: read it
   * after mount, and again when the phone face comes back (the desktop may
   * have changed it meanwhile). */
  const refreshSort = useCallback(() => setSortState(readSort()), []);

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
    newDoc,
    creating: create.isPending,
  };
}

export type DocsPhoneCtl = ReturnType<typeof useDocsPhone>;
export type { DocSortKey };
