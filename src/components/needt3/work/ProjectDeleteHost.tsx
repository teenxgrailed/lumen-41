"use client";

/* DELETE A PROJECT — one confirm for every place that offers it (the sidebar
 * row's menu, the project page's ⋯ menu).
 *
 * Delete is a soft delete: the project goes to Trash, its tasks stay as they
 * are, and the notice carries Undo. Restore in Trash is the same write.
 */
import { useRef } from "react";

import { useRouter } from "next/navigation";

import { create } from "zustand";

import { newDate } from "@/lib/date-utils";
import { useTrashProject } from "@/lib/needt3/hooks/projects";
import type { V3Project } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

import { BoardDialog, DialogFoot, DialogHead } from "../places/board/parts";

type Target = Pick<V3Project, "id" | "name">;

interface DeleteAsk {
  project: Target | null;
  ask: (project: Target) => void;
  close: () => void;
}

export const useProjectDeleteAsk = create<DeleteAsk>((set) => ({
  project: null,
  ask: (project) => set({ project: { id: project.id, name: project.name } }),
  close: () => set({ project: null }),
}));

/** Open the confirm for a project. */
export function askDeleteProject(project: Target) {
  useProjectDeleteAsk.getState().ask(project);
}

/** The words of the confirm; one place so the dialog and its test agree. */
export function deleteProjectText(name: string) {
  return {
    title: `Delete “${name}”?`,
    body: "It moves to Trash and its tasks stay as they are. You can undo it right after, or restore it from Trash.",
    confirm: "Delete project",
  };
}

/** Mount once in the shell (the sidebar). */
export function ProjectDeleteHost() {
  const router = useRouter();
  const project = useProjectDeleteAsk((s) => s.project);
  const close = useProjectDeleteAsk((s) => s.close);
  const { trash } = useTrashProject();
  // The words stay drawn while the dialog slides away.
  const last = useRef<Target | null>(null);
  if (project) last.current = project;
  const text = deleteProjectText(last.current?.name ?? "");

  const go = () => {
    if (!project) return;
    const target = project;
    close();
    // Leave a page that is about to disappear.
    if (window.location.pathname === `/projects/${target.id}`) {
      router.push("/projects");
    }
    void trash(target.id, newDate().toISOString())
      .then(({ undo }) =>
        notify.success(`Deleted “${target.name}”`, {
          action: { label: "Undo", onClick: () => void undo() },
        })
      )
      .catch(() => undefined);
  };

  return (
    <BoardDialog open={!!project} onClose={close} label="Delete project">
      <DialogHead art="trash" title={text.title} sub={text.body} />
      <DialogFoot>
        <button type="button" className="nx-btn nx-btn-text" onClick={close}>
          Cancel
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-danger"
          data-project-delete-confirm=""
          onClick={go}
        >
          {text.confirm}
        </button>
      </DialogFoot>
    </BoardDialog>
  );
}
