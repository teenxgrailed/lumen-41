"use client";

import { useMemo, useRef } from "react";

import { useBoards, useTrashBoard } from "@/lib/needt3/hooks/boards";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import { useTasks, useTrashTask } from "@/lib/needt3/hooks/tasks";
import { notify } from "@/lib/notifications";

import strings from "../../../../docs/port/prototype/port/strings/en.json";

const tr = strings["places.jsx"].TrashScreen;

/**
 * Trash: what is in it (tasks and moodboards the person deleted) and the one
 * thing the desktop port wired, Restore, with its notice and Undo. The route
 * calls this once above its two faces.
 *
 * //todo: Delete forever, Empty Trash and pages wait for the routes named in
 * `TrashScreen` (hard delete, a list-trashed-pages mode and a page restore).
 */
export function useTrashController() {
  const timeZone = useTimeZone();
  const tasks = useTasks({ scope: "trash" });
  const boards = useBoards();
  const projects = useProjects();
  const trashTask = useTrashTask();
  const trashBoard = useTrashBoard();

  const projectName = (id: string | null) =>
    id ? projects.data?.find((p) => p.id === id)?.name : undefined;
  const gone = useMemo(
    () => (boards.data ?? []).filter((b) => b.trashedAt),
    [boards.data]
  );
  const dead = useMemo(() => tasks.data ?? [], [tasks.data]);

  // One restore per item at a time: a second tap while the write is in flight
  // would send it twice and stack two notices.
  const restoring = useRef(new Set<string>());
  const once = async (key: string, run: () => Promise<void>) => {
    if (restoring.current.has(key)) return;
    restoring.current.add(key);
    try {
      await run();
    } finally {
      restoring.current.delete(key);
    }
  };

  const restoreTask = (id: string, title: string) =>
    once(`task:${id}`, async () => {
      const back = await trashTask.restore(id);
      notify.success(`Restored “${title || tr.untitled}”`, {
        action: { label: "Undo", onClick: () => void back.undo() },
      });
    });
  const restoreBoard = (id: string, title: string) =>
    once(`board:${id}`, async () => {
      const back = await trashBoard.mutateAsync({ id, trashed: false });
      notify.success(`Restored “${title || tr.untitled_moodboard}”`, {
        action: { label: "Undo", onClick: () => void back.undo() },
      });
    });

  return {
    timeZone,
    tasks,
    boards,
    dead,
    gone,
    projectName,
    restoreTask,
    restoreBoard,
  };
}

export type TrashController = ReturnType<typeof useTrashController>;
