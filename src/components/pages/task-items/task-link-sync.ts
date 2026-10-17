/**
 * A checklist item in a document can be a real Needt task. This file is the
 * whole rulebook for keeping the two in step, pure over plain values so it is
 * tested without a browser or a server:
 *
 *  - what a linked item is, read from the ProseMirror document;
 *  - `reconcile`: given the items, what the server holds and what the two
 *    agreed on last time, what to create, push to the task, pull into the
 *    item, or unlink.
 *
 * The item and the task each own the same three fields: the title (the item's
 * first line), done (ticked / status completed) and the day (the date chip /
 * the due date). The last agreed values (`known`) tell which side changed:
 * a field changed on one side only is carried over; changed on both, the
 * item wins (the person is typing in it); the first time an item meets its
 * task, the task wins (it is the real record). A task missing on the server
 * that was never seen there is a creation still on its way; one that was seen
 * and is gone (deleted or in Trash elsewhere) unlinks the item, which stays
 * as a plain checklist line.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/** The node attributes a linked item carries (see `task-item-extension`). */
export const TASK_ATTRS = ["task", "taskId", "taskDue"] as const;

/** One linked item as the editor holds it. */
export interface LinkedItem {
  taskId: string;
  /** The first line, trimmed. */
  text: string;
  checked: boolean;
  /** "YYYY-MM-DD" or null. */
  due: string | null;
}

/** The task as the server holds it, already reduced to what an item shows. */
export interface RemoteTask {
  id: string;
  title: string;
  done: boolean;
  /** "YYYY-MM-DD" in the person's zone, or null. */
  due: string | null;
  /** In Trash (or archived and gone from the list). */
  trashed: boolean;
}

/** The values item and task last agreed on. */
export interface Known {
  text: string;
  checked: boolean;
  due: string | null;
}

export interface ItemPatch {
  text?: string;
  checked?: boolean;
  due?: string | null;
}

export type SyncAction =
  | {
      kind: "create";
      taskId: string;
      title: string;
      checked: boolean;
      due: string | null;
    }
  | {
      kind: "sync";
      taskId: string;
      /** Written into the item (the task changed). */
      apply: ItemPatch | null;
      /** Written to the task (the item changed). */
      push: ItemPatch | null;
      /** What both hold once these are done. */
      next: Known;
    }
  | { kind: "unlink"; taskId: string };

/** The text of an item's first line: the title of its task. */
export function itemTitle(item: ProseMirrorNode): string {
  const first = item.firstChild;
  return (first ? first.textContent : "").replace(/\s+/g, " ").trim();
}

/** Every linked item in the document, in reading order, each id once. */
export function collectTaskItems(doc: ProseMirrorNode): LinkedItem[] {
  const out: LinkedItem[] = [];
  const seen = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name !== "taskItem") return true;
    const { task, taskId, taskDue, checked } = node.attrs as {
      task?: boolean;
      taskId?: string | null;
      taskDue?: string | null;
      checked?: boolean;
    };
    if (task && typeof taskId === "string" && taskId && !seen.has(taskId)) {
      seen.add(taskId);
      out.push({
        taskId,
        text: itemTitle(node),
        checked: Boolean(checked),
        due: typeof taskDue === "string" && taskDue ? taskDue : null,
      });
    }
    return true;
  });
  return out;
}

/** Ids of the linked items in a document (cheap form of `collectTaskItems`). */
export function taskItemIds(doc: ProseMirrorNode): Set<string> {
  const ids = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name === "taskItem" && node.attrs.task && node.attrs.taskId) {
      ids.add(String(node.attrs.taskId));
    }
    return true;
  });
  return ids;
}

/** The ids a change took out of the document (moved items are not removed). */
export function removedTaskIds(
  before: ProseMirrorNode,
  after: ProseMirrorNode
): string[] {
  const now = taskItemIds(after);
  return [...taskItemIds(before)].filter((id) => !now.has(id));
}

const sameDay = (a: string | null, b: string | null) =>
  (a ?? null) === (b ?? null);

/**
 * What to do so every item and its task agree.
 *
 * `remote` is what the server returned this time; `remoteLoaded` is false
 * before the first answer (nothing is created or unlinked on a guess).
 */
export function reconcile(input: {
  items: readonly LinkedItem[];
  remote: ReadonlyMap<string, RemoteTask>;
  known: ReadonlyMap<string, Known>;
  remoteLoaded: boolean;
}): SyncAction[] {
  const { items, remote, known, remoteLoaded } = input;
  const actions: SyncAction[] = [];
  for (const item of items) {
    const r = remote.get(item.taskId);
    const k = known.get(item.taskId);

    if (!r || r.trashed) {
      if (!remoteLoaded) continue;
      if (r?.trashed || k) {
        actions.push({ kind: "unlink", taskId: item.taskId });
      } else if (item.text) {
        // Not on the server and never was: the task still has to be made.
        actions.push({
          kind: "create",
          taskId: item.taskId,
          title: item.text,
          checked: item.checked,
          due: item.due,
        });
      }
      continue;
    }

    if (!k) {
      // The first meeting: the task is the record, the item follows it.
      const apply: ItemPatch = {};
      if (r.title && item.text !== r.title) apply.text = r.title;
      if (item.checked !== r.done) apply.checked = r.done;
      if (!sameDay(item.due, r.due)) apply.due = r.due;
      actions.push({
        kind: "sync",
        taskId: item.taskId,
        apply: Object.keys(apply).length ? apply : null,
        push: null,
        next: {
          text: r.title || item.text,
          checked: r.done,
          due: r.due,
        },
      });
      continue;
    }

    const apply: ItemPatch = {};
    const push: ItemPatch = {};
    const next: Known = { ...k };

    const textLocal = item.text !== k.text;
    const textRemote = r.title !== k.text;
    if (textLocal && item.text) {
      push.text = item.text;
      next.text = item.text;
    } else if (!textLocal && textRemote && r.title) {
      apply.text = r.title;
      next.text = r.title;
    }

    const doneLocal = item.checked !== k.checked;
    const doneRemote = r.done !== k.checked;
    if (doneLocal) {
      if (item.checked !== r.done) push.checked = item.checked;
      next.checked = item.checked;
    } else if (doneRemote) {
      apply.checked = r.done;
      next.checked = r.done;
    }

    const dueLocal = !sameDay(item.due, k.due);
    const dueRemote = !sameDay(r.due, k.due);
    if (dueLocal) {
      if (!sameDay(item.due, r.due)) push.due = item.due;
      next.due = item.due;
    } else if (dueRemote) {
      apply.due = r.due;
      next.due = r.due;
    }

    const hasApply = Object.keys(apply).length > 0;
    const hasPush = Object.keys(push).length > 0;
    const changedKnown =
      next.text !== k.text ||
      next.checked !== k.checked ||
      !sameDay(next.due, k.due);
    if (hasApply || hasPush || changedKnown) {
      actions.push({
        kind: "sync",
        taskId: item.taskId,
        apply: hasApply ? apply : null,
        push: hasPush ? push : null,
        next,
      });
    }
  }
  return actions;
}

/** The body of a write to the task for an item patch (`PUT /api/tasks/:id`). */
export function taskWriteBody(
  patch: ItemPatch,
  toIso: (day: string) => string | null
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.text !== undefined) body.title = patch.text;
  if (patch.checked !== undefined) {
    body.status = patch.checked ? "completed" : "todo";
  }
  if (patch.due !== undefined) {
    body.dueDate = patch.due ? toIso(patch.due) : null;
  }
  return body;
}
