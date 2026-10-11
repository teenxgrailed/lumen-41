"use client";

import { useCallback, useState } from "react";

import type { V3Project } from "@/lib/needt3/map";

import { PROJECT_SWATCHES, type WorkTab } from "./model";

/** What the project edit sheet holds while it is open. */
export interface ProjectEditDraft {
  name: string;
  color: string;
}

/**
 * The state of Tasks / Projects that must outlive a face swap.
 *
 * `WorkScreen` picks the phone face or the desktop face with `usePhoneUi()`
 * and crossing 700 px swaps them; whatever a face owns is lost with it. So the
 * controller lives here, called once above the switch, and both faces read and
 * write the same values: the selected tab, which sections are folded, which
 * long lists were opened past their cap, the project page's folds and its
 * "Add a task" text, and the project edit sheet (open for which project, and
 * what has been typed in it).
 *
 * Transient chrome stays with its face on purpose: the phone's pull-down plate
 * and its ⋯ action sheet, the desktop's menus and hover. Writes in flight are
 * not here either: a mutation outlives the component that started it.
 */
export function useWorkState(initialTab: WorkTab) {
  const [tab, setTab] = useState<WorkTab>(initialTab);
  const [fold, setFold] = useState<Record<string, boolean>>({ __done: true });
  const [pageFold, setPageFold] = useState<Record<string, boolean>>({
    __done: true,
  });
  const [more, setMore] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState<ProjectEditDraft | null>(null);

  const flip = useCallback(
    (k: string) => () => setFold((f) => ({ ...f, [k]: !f[k] })),
    []
  );
  const flipPage = useCallback(
    (k: string) => () => setPageFold((f) => ({ ...f, [k]: !f[k] })),
    []
  );
  const openMore = useCallback(
    (k: string) => () => setMore((m) => ({ ...m, [k]: true })),
    []
  );
  const startEdit = useCallback(
    (p: Pick<V3Project, "id" | "name" | "color">) => {
      setEditId(p.id);
      setEdit({ name: p.name, color: p.color || PROJECT_SWATCHES[0][1] });
    },
    []
  );
  const stopEdit = useCallback(() => {
    setEditId(null);
    setEdit(null);
  }, []);

  return {
    tab,
    setTab,
    fold,
    flip,
    pageFold,
    flipPage,
    more,
    openMore,
    draft,
    setDraft,
    editId,
    edit,
    setEdit,
    startEdit,
    stopEdit,
  };
}

export type WorkState = ReturnType<typeof useWorkState>;
