"use client";

import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { newDate } from "@/lib/date-utils";
import { liveTasks, trashedTasks } from "@/lib/needt3/derive";
import {
  type ApiTask,
  type ApiTaskPart,
  type ApiTaskWait,
  type V3Task,
  type V3TaskPart,
  type V3TaskPatch,
  taskFromApi,
  taskPatchToApi,
} from "@/lib/needt3/map";
import { type TaskFilter, qk } from "@/lib/needt3/query-keys";
import { serialByKey } from "@/lib/needt3/serial";

import {
  dropListItem,
  fetchJson,
  findListItem,
  patchListItem,
  previousFields,
  revisionHeader,
  sendJson,
  useUndoableMutation,
} from "./core";
import { useTimeZone } from "./settings";

const TASKS = qk.tasks();

/**
 * Tasks from `GET /api/tasks`, in the prototype's words. Trash is a filter
 * here: `scope: "live"` (default) hides trashed tasks, `"trash"` shows only
 * them.
 */
export function useTasks(filter: TaskFilter = {}) {
  const tz = useTimeZone();
  return useQuery({
    queryKey: qk.tasks(filter),
    queryFn: async () => {
      const rows = await fetchJson<ApiTask[]>("/api/tasks");
      //todo: GET /api/tasks has no trash/project filter yet; filtered here.
      let list = rows.map((r) => taskFromApi(r, tz));
      if (filter.projectId)
        list = list.filter((t) => t.projectId === filter.projectId);
      const scope = filter.scope ?? "live";
      return scope === "live"
        ? liveTasks(list)
        : scope === "trash"
          ? trashedTasks(list)
          : list;
    },
  });
}

export function useTask(id: string | null | undefined) {
  const tz = useTimeZone();
  return useQuery({
    queryKey: qk.task(id ?? ""),
    enabled: !!id,
    queryFn: async () =>
      taskFromApi(await fetchJson<ApiTask>(`/api/tasks/${id}`), tz),
  });
}

interface UpdateVars {
  id: string;
  patch: V3TaskPatch;
}

function applyLocal(t: V3Task, patch: V3TaskPatch): V3Task {
  const next = { ...t, ...patch } as V3Task;
  if ("done" in patch) next.status = patch.done ? "completed" : "todo";
  return next;
}

/** Patch a task. Resolves to `{ result, undo }`; undo writes the old fields back. */
export function useUpdateTask() {
  const tz = useTimeZone();
  const qc = useQueryClient();
  return useUndoableMutation<UpdateVars, V3Task>({
    scope: [TASKS, [...qk.task("")].slice(0, 2)],
    label: "update the task",
    inverse: (qc, { id, patch }) => {
      const cur = findListItem<V3Task>(qc, TASKS, id);
      return cur ? { id, patch: previousFields(cur, patch) } : null;
    },
    optimistic: (qc, { id, patch }) => {
      patchListItem<V3Task>(qc, TASKS, id, (t) => applyLocal(t, patch));
      qc.setQueryData<V3Task>(qk.task(id), (t) =>
        t ? applyLocal(t, patch) : t
      );
    },
    /* Writes to one task go one at a time, and each reads the revision
       only after the previous PUT has stored its own — two in flight would
       send the same If-Match and the second would 409. */
    request: ({ id, patch }) =>
      serialByKey(`task:${id}`, async () => {
        const held =
          findListItem<V3Task>(qc, TASKS, id) ??
          qc.getQueryData<V3Task>(qk.task(id));
        const saved = taskFromApi(
          await sendJson<ApiTask>(
            `/api/tasks/${id}`,
            "PUT",
            taskPatchToApi(patch, tz),
            revisionHeader(held?.updatedAt)
          ),
          tz
        );
        // The server's row carries the new revision; the next edit sends it.
        patchListItem<V3Task>(qc, TASKS, id, () => saved);
        qc.setQueryData<V3Task>(qk.task(id), (t) => (t ? saved : t));
        return saved;
      }),
  });
}

/** Close or reopen a task. */
export function useToggleTask() {
  const update = useUpdateTask();
  return {
    ...update,
    toggle: (task: Pick<V3Task, "id" | "done">) =>
      update.mutateAsync({ id: task.id, patch: { done: !task.done } }),
  };
}

/** Move a task to Trash (restorable); undo restores it. */
export function useTrashTask() {
  const update = useUpdateTask();
  return {
    ...update,
    trash: (id: string) =>
      update.mutateAsync({
        id,
        patch: { trashedAt: newDate().toISOString() },
      }),
    restore: (id: string) =>
      update.mutateAsync({ id, patch: { trashedAt: null } }),
  };
}

interface CreateVars {
  draft: V3TaskPatch & { title: string };
}

/** Create a task. Undo removes the task it created. */
export function useCreateTask() {
  const tz = useTimeZone();
  return useUndoableMutation<
    CreateVars | { deleteId: string; revision: string | null },
    V3Task | null
  >({
    scope: TASKS,
    label: "create the task",
    inverseFromResult: true,
    inverse: (_qc, vars, result) =>
      "draft" in vars && result
        ? { deleteId: result.id, revision: result.updatedAt }
        : null,
    optimistic: (qc, vars) => {
      if ("deleteId" in vars) dropListItem<V3Task>(qc, TASKS, vars.deleteId);
    },
    request: async (vars) => {
      if ("deleteId" in vars) {
        await sendJson(
          `/api/tasks/${vars.deleteId}`,
          "DELETE",
          undefined,
          revisionHeader(vars.revision)
        );
        return null;
      }
      return taskFromApi(
        await sendJson<ApiTask>(
          "/api/tasks",
          "POST",
          taskPatchToApi(vars.draft, tz)
        ),
        tz
      );
    },
  });
}

/* ---------- parts and waits (card T06b) ---------- */

const TASK_ONE = [...qk.task("")].slice(0, 2);

/** Rewrite one task in every cached list and in its own entry. */
function patchTaskCaches(
  qc: QueryClient,
  taskId: string,
  fn: (t: V3Task) => V3Task
) {
  patchListItem<V3Task>(qc, TASKS, taskId, fn);
  qc.setQueryData<V3Task>(qk.task(taskId), (t) => (t ? fn(t) : t));
}

function cachedTask(qc: QueryClient, taskId: string) {
  return (
    qc.getQueryData<V3Task>(qk.task(taskId)) ??
    findListItem<V3Task>(qc, TASKS, taskId)
  );
}

type PartFields = Partial<Pick<V3TaskPart, "title" | "done">> & {
  position?: number;
};

type PartVars =
  | {
      op: "add";
      taskId: string;
      title: string;
      done?: boolean;
      position?: number;
    }
  | {
      op: "update";
      taskId: string;
      partId: string;
      patch: PartFields;
      prev: PartFields;
    }
  | { op: "remove"; taskId: string; partId: string };

let tempIds = 0;
const tempId = (kind: string) => `${kind}-pending-${++tempIds}`;

/**
 * Add, change and delete a task's parts. Each call resolves to
 * `{ result, undo }`: undo deletes an added part, writes the old fields back,
 * or re-creates a deleted part at its old position.
 */
export function useTaskParts() {
  const qc = useQueryClient();
  const m = useUndoableMutation<PartVars, ApiTaskPart>({
    scope: [TASKS, TASK_ONE],
    label: "change the parts",
    inverseFromResult: true,
    inverse: (_qc, vars, result) => {
      if (!result) return null;
      if (vars.op === "add")
        return { op: "remove", taskId: vars.taskId, partId: result.id };
      if (vars.op === "update")
        return { ...vars, patch: vars.prev, prev: vars.patch };
      return {
        op: "add",
        taskId: vars.taskId,
        title: result.title,
        done: result.done,
        position: result.position,
      };
    },
    optimistic: (qc, vars) =>
      patchTaskCaches(qc, vars.taskId, (t) => {
        const parts = t.parts ?? [];
        if (vars.op === "add")
          return {
            ...t,
            parts: [
              ...parts,
              { id: tempId("part"), title: vars.title, done: !!vars.done },
            ],
          };
        if (vars.op === "update") {
          const fields: Partial<V3TaskPart> = {};
          if (vars.patch.title !== undefined) fields.title = vars.patch.title;
          if (vars.patch.done !== undefined) fields.done = vars.patch.done;
          return {
            ...t,
            parts: parts.map((p) =>
              p.id === vars.partId ? { ...p, ...fields } : p
            ),
          };
        }
        return { ...t, parts: parts.filter((p) => p.id !== vars.partId) };
      }),
    request: async (vars) => {
      const base = `/api/tasks/${vars.taskId}/parts`;
      if (vars.op === "add") {
        const { title, done, position } = vars;
        return sendJson<ApiTaskPart>(base, "POST", { title, done, position });
      }
      if (vars.op === "update")
        return sendJson<ApiTaskPart>(
          `${base}/${vars.partId}`,
          "PATCH",
          vars.patch
        );
      return sendJson<ApiTaskPart>(`${base}/${vars.partId}`, "DELETE");
    },
  });
  return {
    ...m,
    add: (taskId: string, title: string, position?: number) =>
      m.mutateAsync({ op: "add", taskId, title, position }),
    update: (taskId: string, partId: string, patch: PartFields) => {
      const cur = cachedTask(qc, taskId)?.parts.find((p) => p.id === partId);
      const prev: PartFields = {};
      if (cur && patch.title !== undefined) prev.title = cur.title;
      if (cur && patch.done !== undefined) prev.done = cur.done;
      return m.mutateAsync({ op: "update", taskId, partId, patch, prev });
    },
    toggle: (taskId: string, part: Pick<V3TaskPart, "id" | "done">) =>
      m.mutateAsync({
        op: "update",
        taskId,
        partId: part.id,
        patch: { done: !part.done },
        prev: { done: part.done },
      }),
    remove: (taskId: string, partId: string) =>
      m.mutateAsync({ op: "remove", taskId, partId }),
  };
}

type WaitVars =
  | {
      op: "open";
      taskId: string;
      on: string;
      for: string;
      prev: string | null;
    }
  | { op: "resolve"; taskId: string; waitId: string; reopen: string | null }
  | { op: "reopen"; taskId: string; waitId: string };

/**
 * Open and resolve a task's waits. A task waits on one person at a time:
 * opening a wait resolves the open one, and its undo reopens it.
 */
export function useTaskWaits() {
  const qc = useQueryClient();
  const m = useUndoableMutation<WaitVars, ApiTaskWait>({
    scope: [TASKS, TASK_ONE],
    label: "change what the task waits on",
    inverseFromResult: true,
    inverse: (_qc, vars, result) => {
      if (!result) return null;
      if (vars.op === "open")
        return {
          op: "resolve",
          taskId: vars.taskId,
          waitId: result.id,
          reopen: vars.prev,
        };
      // Reopening resolves any other open wait on the server.
      if (vars.op === "resolve")
        return { op: "reopen", taskId: vars.taskId, waitId: vars.waitId };
      return {
        op: "resolve",
        taskId: vars.taskId,
        waitId: vars.waitId,
        reopen: null,
      };
    },
    optimistic: (qc, vars) => {
      if (vars.op === "reopen") return; // the reopened row's text is not cached
      patchTaskCaches(qc, vars.taskId, (t) =>
        vars.op === "open"
          ? {
              ...t,
              waits: [
                {
                  id: tempId("wait"),
                  on: vars.on,
                  onName: null,
                  for: vars.for,
                },
              ],
            }
          : { ...t, waits: (t.waits ?? []).filter((w) => w.id !== vars.waitId) }
      );
    },
    request: async (vars) => {
      const base = `/api/tasks/${vars.taskId}/waits`;
      if (vars.op === "open")
        return sendJson<ApiTaskWait>(base, "POST", {
          on: vars.on,
          for: vars.for,
        });
      const wait = await sendJson<ApiTaskWait>(
        `${base}/${vars.waitId}`,
        "PATCH",
        { resolved: vars.op === "resolve" }
      );
      if (vars.op === "resolve" && vars.reopen)
        await sendJson(`${base}/${vars.reopen}`, "PATCH", { resolved: false });
      return wait;
    },
  });
  return {
    ...m,
    wait: (taskId: string, on: string, reason: string) =>
      m.mutateAsync({
        op: "open",
        taskId,
        on,
        for: reason,
        prev: cachedTask(qc, taskId)?.waits[0]?.id ?? null,
      }),
    resolve: (taskId: string, waitId: string) =>
      m.mutateAsync({ op: "resolve", taskId, waitId, reopen: null }),
  };
}
