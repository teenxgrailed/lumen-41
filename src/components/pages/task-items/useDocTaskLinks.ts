"use client";

import { useContext, useEffect, useMemo, useRef } from "react";

import { QueryClientContext } from "@tanstack/react-query";
import { type Editor } from "@tiptap/core";

import { browserTimeZone } from "@/lib/needt3/hooks/core";
import { isoToDay, localToIso } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { TASK_SYNC_META } from "./task-item-extension";
import {
  type ItemPatch,
  type Known,
  type RemoteTask,
  type SyncAction,
  collectTaskItems,
  reconcile,
  taskWriteBody,
} from "./task-link-sync";

/** How long after the last edit the item and its task are brought in step. */
const EDIT_DELAY_MS = 600;
/** The poll for a task changed elsewhere while the page is open. */
const POLL_MS = 20_000;
/** A task that failed to be made is not tried again for this long. */
const RETRY_MS = 30_000;

interface ApiTaskRow {
  id: string;
  title: string;
  status: string;
  dueDate?: string | null;
  trashedAt?: string | null;
}

/** Write an item patch into the document (not an undo step, never a prompt). */
export function applyItemPatch(
  editor: Editor,
  taskId: string,
  patch: ItemPatch
): boolean {
  let found: { pos: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (
      !found &&
      node.type.name === "taskItem" &&
      node.attrs.task &&
      node.attrs.taskId === taskId
    ) {
      found = { pos };
      return false;
    }
    return true;
  });
  if (!found) return false;
  const { pos } = found as { pos: number };
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return false;
  const tr = editor.state.tr;
  if (patch.text !== undefined) {
    const para = node.firstChild;
    const plain =
      !!para &&
      para.type.name === "paragraph" &&
      para.childCount <= 1 &&
      (para.childCount === 0 ||
        (para.firstChild!.isText && para.firstChild!.marks.length === 0));
    if (plain && para) {
      const from = pos + 2;
      const to = pos + 1 + para.nodeSize - 1;
      if (patch.text) tr.replaceWith(from, to, editor.schema.text(patch.text));
      else tr.delete(from, to);
    }
  }
  const attrs = { ...node.attrs };
  let attrsChanged = false;
  if (patch.checked !== undefined && attrs.checked !== patch.checked) {
    attrs.checked = patch.checked;
    attrsChanged = true;
  }
  if (patch.due !== undefined && (attrs.taskDue ?? null) !== patch.due) {
    attrs.taskDue = patch.due;
    attrsChanged = true;
  }
  if (attrsChanged) tr.setNodeMarkup(pos, undefined, attrs);
  if (!tr.docChanged) return true;
  tr.setMeta("addToHistory", false);
  tr.setMeta(TASK_SYNC_META, true);
  editor.view.dispatch(tr);
  return true;
}

/** Turn a task item into a plain checklist item (its task is gone or left alone). */
export function unlinkItem(editor: Editor, taskId: string) {
  let at = -1;
  editor.state.doc.descendants((node, pos) => {
    if (
      at < 0 &&
      node.type.name === "taskItem" &&
      node.attrs.taskId === taskId
    ) {
      at = pos;
      return false;
    }
    return true;
  });
  if (at < 0) return;
  const node = editor.state.doc.nodeAt(at);
  if (!node) return;
  const tr = editor.state.tr.setNodeMarkup(at, undefined, {
    ...node.attrs,
    task: false,
    taskId: null,
    taskDue: null,
  });
  tr.setMeta("addToHistory", false);
  tr.setMeta(TASK_SYNC_META, true);
  editor.view.dispatch(tr);
}

/**
 * Keeps the task items of a page and their Tasks in step: creates a task for
 * a new item once it has text, pushes a changed title, tick or date to the
 * task, and pulls the same three back when the task changed elsewhere (the
 * Tasks screen, Today, the API). The rules are `reconcile`; this only fetches,
 * writes and schedules.
 */
export function useDocTaskLinks({
  editor,
  pageId,
  projectId,
  active,
}: {
  editor: Editor | null;
  pageId: string;
  projectId: string | null;
  /** The page is loaded and writable. */
  active: boolean;
}) {
  const qc = useContext(QueryClientContext);
  const known = useRef(new Map<string, Known>());
  const remote = useRef(new Map<string, RemoteTask>());
  const loaded = useRef(false);
  const retryAt = useRef(new Map<string, number>());
  const project = useRef(projectId);
  project.current = projectId;
  const queryClient = useRef(qc);
  queryClient.current = qc;

  const api = useMemo(() => {
    let running = false;
    let again: { refetch: boolean } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tz = () =>
      queryClient.current?.getQueryData<{ timeZone?: string }>(qk.settings())
        ?.timeZone ?? browserTimeZone();
    const toRemote = (row: ApiTaskRow): RemoteTask => ({
      id: row.id,
      title: row.title,
      done: row.status === "completed",
      due: isoToDay(row.dueDate ?? null, tz()),
      trashed: Boolean(row.trashedAt),
    });
    const invalidate = () => {
      const client = queryClient.current;
      if (!client) return;
      void client.invalidateQueries({ queryKey: qk.tasks() });
      void client.invalidateQueries({ queryKey: ["tasks"] });
    };

    async function load(): Promise<boolean> {
      try {
        const base = `/api/tasks?originPageId=${encodeURIComponent(pageId)}`;
        const [open, archived] = await Promise.all([
          fetch(base),
          fetch(`${base}&archived=true`),
        ]);
        if (!open.ok) return false;
        const rows = [
          ...((await open.json()) as ApiTaskRow[]),
          ...(archived.ok ? ((await archived.json()) as ApiTaskRow[]) : []),
        ];
        remote.current = new Map(rows.map((r) => [r.id, toRemote(r)]));
        loaded.current = true;
        return true;
      } catch {
        return false;
      }
    }

    async function create(
      action: Extract<SyncAction, { kind: "create" }>
    ): Promise<void> {
      const now = Date.now();
      if ((retryAt.current.get(action.taskId) ?? 0) > now) return;
      const send = (withProject: boolean) =>
        fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: action.taskId,
            title: action.title,
            status: action.checked ? "completed" : "todo",
            ...(action.due ? { dueDate: localToIso(action.due, tz()) } : {}),
            originPageId: pageId,
            ...(withProject && project.current
              ? { projectId: project.current }
              : {}),
          }),
        });
      try {
        let response = await send(true);
        // A page in a project that has since been archived: the task still
        // belongs to the page.
        if (response.status === 400 && project.current) {
          response = await send(false);
        }
        if (!response.ok) throw new Error(String(response.status));
        const row = (await response.json()) as ApiTaskRow;
        remote.current.set(action.taskId, toRemote(row));
        known.current.set(action.taskId, {
          text: action.title,
          checked: action.checked,
          due: action.due,
        });
        invalidate();
      } catch {
        retryAt.current.set(action.taskId, now + RETRY_MS);
        // The id may exist already (a retry after a slow answer): look again.
        loaded.current = false;
        notify.error("Could not create the task from this item.");
      }
    }

    async function push(
      action: Extract<SyncAction, { kind: "sync" }>
    ): Promise<boolean> {
      try {
        const response = await fetch(`/api/tasks/${action.taskId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            taskWriteBody(action.push!, (day) => localToIso(day, tz()))
          ),
        });
        if (!response.ok) return false;
        const row = (await response.json()) as ApiTaskRow;
        remote.current.set(action.taskId, toRemote(row));
        invalidate();
        return true;
      } catch {
        return false;
      }
    }

    async function pass(ed: Editor, refetch: boolean) {
      // A page with no task items asks the server nothing.
      if (collectTaskItems(ed.state.doc).length === 0) return;
      if (refetch || !loaded.current) await load();
      const items = collectTaskItems(ed.state.doc);
      const actions = reconcile({
        items,
        remote: remote.current,
        known: known.current,
        remoteLoaded: loaded.current,
      });
      for (const action of actions) {
        if (ed.isDestroyed) return;
        if (action.kind === "unlink") {
          known.current.delete(action.taskId);
          unlinkItem(ed, action.taskId);
        } else if (action.kind === "create") {
          await create(action);
        } else {
          if (action.apply) applyItemPatch(ed, action.taskId, action.apply);
          if (action.push) {
            if (await push(action))
              known.current.set(action.taskId, action.next);
          } else {
            known.current.set(action.taskId, action.next);
          }
        }
      }
    }

    async function run(ed: Editor, refetch: boolean) {
      if (running) {
        again = { refetch: refetch || Boolean(again?.refetch) };
        return;
      }
      running = true;
      try {
        await pass(ed, refetch);
        while (again) {
          const next = again;
          again = null;
          await pass(ed, next.refetch);
        }
      } finally {
        running = false;
      }
    }

    return {
      schedule(ed: Editor, delay = EDIT_DELAY_MS, refetch = false) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          if (!ed.isDestroyed) void run(ed, refetch);
        }, delay);
      },
      now: (ed: Editor, refetch: boolean) => run(ed, refetch),
      cancel() {
        if (timer) clearTimeout(timer);
        timer = null;
      },
      /** The title item and task last agreed on (for the removal prompt). */
      title: (id: string) => known.current.get(id)?.text ?? null,
      /** Move to Trash (the Delete answer of the removal prompt). */
      async trash(ids: string[]) {
        const stamp = new Date().toISOString();
        const results = await Promise.all(
          ids.map((id) =>
            fetch(`/api/tasks/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ trashedAt: stamp }),
            })
              .then((r) => r.ok)
              .catch(() => false)
          )
        );
        ids.forEach((id) => {
          known.current.delete(id);
          remote.current.delete(id);
        });
        invalidate();
        return results.every(Boolean);
      },
    };
    // pageId changes mean a different page: the effect below resets state.
  }, [pageId]);

  useEffect(() => {
    known.current = new Map();
    remote.current = new Map();
    loaded.current = false;
    retryAt.current = new Map();
  }, [pageId]);

  useEffect(() => {
    if (!editor || !active) return undefined;
    const onUpdate = ({
      transaction,
    }: {
      transaction: { getMeta: (k: string) => unknown };
    }) => {
      if (transaction.getMeta(TASK_SYNC_META)) return;
      api.schedule(editor);
    };
    editor.on("update", onUpdate);
    // The first look: the tasks decide how the items start (they are the record).
    api.schedule(editor, 50, true);
    const refresh = () => {
      if (document.visibilityState === "visible") {
        api.schedule(editor, 0, true);
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const poll = window.setInterval(refresh, POLL_MS);
    // A task changed in another screen refreshes the task lists in the cache;
    // the items follow.
    const client = queryClient.current;
    const unsubscribe = client
      ? client.getQueryCache().subscribe((event) => {
          const key = event.query.queryKey;
          if (
            event.type === "updated" &&
            event.action.type === "success" &&
            Array.isArray(key) &&
            key.includes("tasks")
          ) {
            api.schedule(editor, 400, true);
          }
        })
      : undefined;
    return () => {
      editor.off("update", onUpdate);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(poll);
      unsubscribe?.();
      api.cancel();
    };
  }, [api, editor, active]);

  return api;
}
