"use client";

import { useMemo, useRef, useState } from "react";

import {
  useBoards,
  useDeleteBoardForever,
  useTrashBoard,
} from "@/lib/needt3/hooks/boards";
import {
  useDeleteDocForever,
  useTrashDoc,
  useTrashedDocs,
} from "@/lib/needt3/hooks/docs";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import { useTasks, useTrashTask } from "@/lib/needt3/hooks/tasks";
import { notify } from "@/lib/notifications";

import strings from "../../../../docs/port/prototype/port/strings/en.json";

const tr = strings["places.jsx"].TrashScreen;

/** What a Delete forever dialog is asking about. */
export type TrashAsk =
  | { kind: "page" | "board"; id: string; title: string }
  | { kind: "all" };

/**
 * Trash: what is in it (pages, tasks and moodboards the person deleted) and
 * the one Restore (with its notice and Undo). Pages and moodboards can also
 * be deleted for good, one at a time or all at once (Empty Trash), after a
 * confirm that says there is no Undo. The route calls this once above its two
 * faces, so an open confirm survives the window crossing 700 px.
 *
 * //todo: tasks' Delete forever (and so Empty Trash for tasks) waits for a
 * hard delete on DELETE /api/tasks/:id (it archives), and nothing purges
 * after 30 days yet (the worker job).
 */
export function useTrashController() {
  const timeZone = useTimeZone();
  const tasks = useTasks({ scope: "trash" });
  const boards = useBoards();
  const docs = useTrashedDocs();
  const projects = useProjects();
  const trashTask = useTrashTask();
  const trashBoard = useTrashBoard();
  const trashDoc = useTrashDoc();
  const deleteBoard = useDeleteBoardForever();
  const deleteDoc = useDeleteDocForever();
  const [ask, setAsk] = useState<TrashAsk | null>(null);

  const projectName = (id: string | null) =>
    id ? projects.data?.find((p) => p.id === id)?.name : undefined;
  const gone = useMemo(
    () => (boards.data ?? []).filter((b) => b.trashedAt),
    [boards.data]
  );
  const dead = useMemo(() => tasks.data ?? [], [tasks.data]);
  const pages = useMemo(() => docs.data ?? [], [docs.data]);

  // One write per item at a time: a second tap while the write is in flight
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
  const restorePage = (id: string, title: string) =>
    once(`page:${id}`, async () => {
      try {
        const back = await trashDoc.mutateAsync({ id, trashed: false });
        notify.success(`Restored “${title || tr.untitled}”`, {
          action: { label: "Undo", onClick: () => void back.undo() },
        });
      } catch {
        /* the hook told the person and put the page back */
      }
    });

  const deleteBoardForever = (id: string, title: string) =>
    once(`board:${id}`, async () => {
      try {
        await deleteBoard.mutateAsync({ id });
        notify.success(`Deleted “${title || tr.untitled_moodboard}” for good`);
      } catch {
        /* the hook told the person and put the board back */
      }
    });
  const deletePageForever = (id: string, title: string) =>
    once(`page:${id}`, async () => {
      try {
        await deleteDoc.mutateAsync({ id });
        notify.success(`Deleted “${title || tr.untitled}” for good`);
      } catch {
        /* the hook told the person and put the page back */
      }
    });

  /**
   * Every page and moodboard in Trash, for good. Tasks stay: the server has no
   * hard delete for them. Each goes on its own, so a refusal on one does not
   * stop the rest; a failed write has already told the person.
   */
  const emptyTrash = () =>
    once("all", async () => {
      const jobs = [
        ...pages.map((p) => deleteDoc.mutateAsync({ id: p.id })),
        ...gone.map((b) => deleteBoard.mutateAsync({ id: b.id })),
      ];
      const done = await Promise.allSettled(jobs);
      if (done.some((r) => r.status === "fulfilled"))
        notify.success(tr.trash_emptied);
    });

  /** Carry out a confirmed Delete forever / Empty Trash. */
  const runAsk = (a: TrashAsk) =>
    a.kind === "all"
      ? emptyTrash()
      : a.kind === "page"
        ? deletePageForever(a.id, a.title)
        : deleteBoardForever(a.id, a.title);

  /** What Empty Trash takes, and what it leaves. */
  const emptyCounts = {
    pages: pages.length,
    boards: gone.length,
    tasks: dead.length,
  };

  return {
    timeZone,
    tasks,
    boards,
    docs,
    dead,
    gone,
    pages,
    projectName,
    restoreTask,
    restoreBoard,
    restorePage,
    deleteBoardForever,
    deletePageForever,
    emptyCounts,
    runAsk,
    ask,
    setAsk,
  };
}

export type TrashController = ReturnType<typeof useTrashController>;
