import type { ChainedCommands } from "@tiptap/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";

import { randomId } from "@/lib/uuid";

import { TASK_KEEP_META } from "./task-item-extension";

/** The checklist item around a position, with the position of the item. */
export function taskItemAround(
  $pos: ResolvedPos
): { node: ProseMirrorNode; pos: number } | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name === "taskItem") {
      return { node, pos: $pos.before(depth) };
    }
  }
  return null;
}

/**
 * "Task" in the slash menu and the phone bar: the line you are on becomes a
 * task item (a checklist item that is a real Needt task); on a task item it
 * turns the link off again (the task, if it was made, stays in Tasks). Adds to
 * a chain so the slash text can be removed first.
 */
export function withTaskItem(chain: ChainedCommands): ChainedCommands {
  return chain.command(({ tr, commands }) => {
    let item = taskItemAround(tr.selection.$from);
    if (!item) {
      if (!commands.toggleTaskList()) return false;
      item = taskItemAround(tr.selection.$from);
    }
    if (!item) return false;
    const on = !item.node.attrs.task;
    tr.setNodeMarkup(item.pos, undefined, {
      ...item.node.attrs,
      task: on,
      taskId: on ? item.node.attrs.taskId || randomId() : null,
      taskDue: on ? item.node.attrs.taskDue : null,
    });
    // Never a removal prompt: the item stays.
    tr.setMeta(TASK_KEEP_META, true);
    return true;
  });
}
