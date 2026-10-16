"use client";

import {
  useDuplicateDoc,
  useTrashDoc,
  useUpdateDoc,
} from "@/lib/needt3/hooks/docs";
import type { V3Doc } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

import { exportHref, renameValue } from "./menu-model";

export type DocSay = (
  text: string,
  undo?: () => void | Promise<unknown>
) => void;

export const docHref = (id: string) => `/pages/${encodeURIComponent(id)}`;

/** The page opened with a request to print it: the editor owns "Export as PDF". */
export const pdfHref = (id: string) => `${docHref(id)}?export=pdf`;

const nameOf = (d: Pick<V3Doc, "title">) => d.title || "Untitled";

/**
 * What the card menus do, on both faces: the page APIs through the same
 * optimistic hooks, each with the way back in the notice. `say` is the face's
 * own notice (the phone's snack, the desktop's toast).
 */
export function useDocActions(say: DocSay) {
  const update = useUpdateDoc();
  const trash = useTrashDoc();
  const copy = useDuplicateDoc();
  const patch = (
    d: V3Doc,
    values: Parameters<typeof update.mutateAsync>[0]["patch"],
    text: string
  ) =>
    void update
      .mutateAsync({ id: d.id, patch: values })
      .then(({ undo }) => say(text, undo))
      .catch(() => undefined);
  return {
    pin: (d: V3Doc) =>
      patch(
        d,
        { isFavorite: !d.isFavorite },
        d.isFavorite ? "Unpinned" : "Pinned"
      ),
    rename: (d: V3Doc, typed: string) => {
      const title = renameValue(d.title, typed);
      if (title) patch(d, { title }, "Renamed");
    },
    /** `projectId` null takes the page out of its project. */
    moveTo: (d: V3Doc, projectId: string | null, projectName?: string) => {
      if ((d.projectId ?? null) === projectId) return;
      patch(
        d,
        { projectId },
        projectId
          ? `Moved to ${projectName ?? "the project"}`
          : "Removed from its project"
      );
    },
    duplicate: (d: V3Doc) =>
      void copy
        .mutateAsync({ id: d.id })
        .then(({ undo }) => say(`Duplicated “${nameOf(d)}”`, undo))
        .catch(() => undefined),
    trash: (d: V3Doc) =>
      void trash
        .mutateAsync({ id: d.id, trashed: true })
        .then(({ undo }) => say(`“${nameOf(d)}” moved to Trash`, undo))
        .catch(() => undefined),
    copyLink: (d: V3Doc) =>
      void navigator.clipboard
        ?.writeText(window.location.origin + docHref(d.id))
        .then(() => say("Link copied"))
        .catch(() => notify.error("Could not copy the link.")),
  };
}

/** Download a page as Markdown (`GET /api/pages/:id/export`). */
export function downloadMarkdown(id: string) {
  const a = document.createElement("a");
  a.href = exportHref(id);
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
