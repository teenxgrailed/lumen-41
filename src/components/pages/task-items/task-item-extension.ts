/**
 * The checklist item, extended so it can be a real Needt task.
 *
 * Attributes (all stored in the page's block JSON, so they sync with the
 * document and reach the API and MCP with the page):
 *  - `task`: this item is a Needt task (a plain checklist item is not);
 *  - `taskId`: the id of its Task (the item makes the id up front and the
 *    task is created with it, so a second device sees the link at once);
 *  - `taskDue`: the day on its date chip, "YYYY-MM-DD".
 *
 * `[] ` (no space inside) starts a task item; `[ ] ` and `[x] ` still start a
 * plain checklist item. A task item shows a date chip at its right end, which
 * is a native date input laid over the chip so the phone's own picker opens.
 */
import { wrappingInputRule } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { isChangeOrigin } from "@tiptap/extension-collaboration";
import { TaskItem } from "@tiptap/extension-list";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";

import { randomId } from "@/lib/uuid";

import { removedTaskIds, taskItemIds } from "./task-link-sync";

/** Meta key on transactions made by the sync itself (never prompt, never undo). */
export const TASK_SYNC_META = "needtTaskSync";
/** Meta key on a change that leaves an item on the page but drops its link (no prompt, but synced). */
export const TASK_KEEP_META = "needtTaskKeep";

type RemovedHandler = (ids: string[]) => void;
const handlers = new WeakMap<Editor, RemovedHandler>();

/** The page's answer to "task items left the page" (the Keep / Delete prompt). */
export function onTaskItemsRemoved(editor: Editor, handler: RemovedHandler) {
  handlers.set(editor, handler);
  return () => {
    if (handlers.get(editor) === handler) handlers.delete(editor);
  };
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-10-20" as "Oct 20"; anything else is no date. */
export function chipLabel(day: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? "");
  if (!m) return "";
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}` : "";
}

type Attrs = Record<string, unknown>;

/**
 * Task items without an id, and the copies of one that has: each gets its own
 * id. Of two items with one id, the one that stood where the original stood
 * (`keeper`, its old position carried through the change) keeps it, so a copy
 * pasted above the original does not take the link.
 */
export function idFixes(
  doc: ProseMirrorNode,
  keeper: ReadonlyMap<string, number>
): Array<{ pos: number; attrs: Attrs }> {
  const byId = new Map<string, number[]>();
  const fixes: Array<{ pos: number; attrs: Attrs }> = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "taskItem" || !node.attrs.task) return true;
    const id = typeof node.attrs.taskId === "string" ? node.attrs.taskId : "";
    if (!id) {
      fixes.push({ pos, attrs: { ...node.attrs, taskId: randomId() } });
    } else {
      byId.set(id, [...(byId.get(id) ?? []), pos]);
    }
    return true;
  });
  for (const [id, positions] of byId) {
    if (positions.length < 2) continue;
    const winner = positions.includes(keeper.get(id) ?? -1)
      ? (keeper.get(id) as number)
      : positions[0];
    for (const pos of positions) {
      if (pos === winner) continue;
      const node = doc.nodeAt(pos);
      if (node) {
        fixes.push({
          pos,
          attrs: { ...node.attrs, taskId: randomId(), taskDue: null },
        });
      }
    }
  }
  return fixes;
}

export const NeedtTaskItem = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      task: {
        default: false,
        // A new line after a task item is a task item too.
        keepOnSplit: true,
        parseHTML: (el: HTMLElement) =>
          el.getAttribute("data-needt-task") === "true",
        renderHTML: (a: Attrs) => (a.task ? { "data-needt-task": "true" } : {}),
      },
      taskId: {
        default: null,
        keepOnSplit: false,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-task-id"),
        renderHTML: (a: Attrs) =>
          a.taskId ? { "data-task-id": String(a.taskId) } : {},
      },
      taskDue: {
        default: null,
        keepOnSplit: false,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-task-due"),
        renderHTML: (a: Attrs) =>
          a.taskDue ? { "data-task-due": String(a.taskDue) } : {},
      },
    };
  },

  addInputRules() {
    return [
      // `[] ` makes a task item …
      wrappingInputRule({
        find: /^\s*\[\]\s$/,
        type: this.type,
        getAttributes: () => ({ task: true, taskId: randomId() }),
      }),
      // … `[ ] ` and `[x] ` a plain checklist item, as before.
      wrappingInputRule({
        find: /^\s*\[([ x])\]\s$/,
        type: this.type,
        getAttributes: (match) => ({
          checked: match[match.length - 1] === "x",
        }),
      }),
    ];
  },

  addNodeView() {
    const parent = this.parent?.();
    if (!parent) return null;
    const editor = this.editor;
    return (props) => {
      const base = parent(props);
      const li = base.dom as HTMLElement;
      const meta = document.createElement("span");
      meta.className = "needt-task-meta";
      meta.contentEditable = "false";
      const chip = document.createElement("span");
      chip.className = "needt-task-due";
      const label = document.createElement("span");
      label.className = "needt-task-due-label";
      const input = document.createElement("input");
      input.type = "date";
      input.className = "needt-task-due-input";
      input.tabIndex = -1;
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "needt-task-due-clear";
      clear.setAttribute("aria-label", "Clear due date");
      clear.textContent = "×";
      chip.append(label, input);
      meta.append(chip, clear);
      li.append(meta);

      const write = (day: string | null) => {
        if (typeof props.getPos !== "function") return;
        const pos = props.getPos();
        if (typeof pos !== "number") return;
        const node = editor.state.doc.nodeAt(pos);
        if (!node) return;
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            taskDue: day,
          })
        );
      };
      input.addEventListener("change", () => write(input.value || null));
      clear.addEventListener("mousedown", (event) => event.preventDefault());
      clear.addEventListener("click", () => write(null));

      const paint = (node: ProseMirrorNode) => {
        const isTask = Boolean(node.attrs.task);
        const day = (node.attrs.taskDue as string | null) || null;
        const editable = editor.isEditable;
        // A read-only page shows a date that is set, never an empty chip.
        meta.hidden = !isTask || (!editable && !day);
        li.toggleAttribute("data-needt-task-item", isTask);
        const text = chipLabel(day);
        label.textContent = text || "Date";
        chip.classList.toggle("is-empty", !text);
        chip.setAttribute(
          "title",
          text ? `Due ${text}` : "Set a due date for this task"
        );
        input.value = day ?? "";
        input.disabled = !editable;
        input.setAttribute("aria-label", text ? `Due ${text}` : "Due date");
        clear.hidden = !editable || !day;
      };
      paint(props.node);

      return {
        ...base,
        update(node, decorations, innerDecorations) {
          const ok = base.update?.(node, decorations, innerDecorations);
          if (ok === false) return false;
          paint(node);
          return true;
        },
        stopEvent(event) {
          const target = event.target as Node | null;
          return Boolean(target && meta.contains(target));
        },
        ignoreMutation(mutation) {
          const target = mutation.target as Node;
          if (meta.contains(target)) return true;
          return base.ignoreMutation?.(mutation) ?? false;
        },
      };
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        // Every task item gets an id, and a copy gets its own: the original
        // (the one that stays where it was) keeps the link.
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          if (transactions.some((tr) => isChangeOrigin(tr))) return null;
          const keeper = new Map<string, number>();
          // `transactions` are the ones this plugin has not seen yet, so the
          // document before them is the first one's, not the original state's.
          transactions[0].before.descendants((node, pos) => {
            if (
              node.type.name === "taskItem" &&
              node.attrs.task &&
              node.attrs.taskId &&
              !keeper.has(String(node.attrs.taskId))
            ) {
              let mapped = pos;
              for (const tr of transactions) mapped = tr.mapping.map(mapped, 1);
              keeper.set(String(node.attrs.taskId), mapped);
            }
            return true;
          });
          const fixes = idFixes(newState.doc, keeper);
          if (!fixes.length) return null;
          const tr = newState.tr;
          for (const fix of fixes) {
            tr.setNodeMarkup(fix.pos, undefined, fix.attrs);
          }
          tr.setMeta("addToHistory", false);
          tr.setMeta(TASK_SYNC_META, true);
          return tr;
        },
      }),
      new Plugin({
        // A task item taken out of the page: the page asks what to do with
        // its task. Not for a remote change, a cut (the item is on the
        // clipboard), the sync's own writes, or a move within the page.
        appendTransaction: (transactions, _oldState, newState) => {
          const handler = handlers.get(editor);
          if (!handler) return null;
          const user = transactions.filter(
            (tr) =>
              tr.docChanged &&
              !isChangeOrigin(tr) &&
              !tr.getMeta(TASK_SYNC_META) &&
              !tr.getMeta(TASK_KEEP_META) &&
              tr.getMeta("uiEvent") !== "cut"
          );
          if (!user.length) return null;
          // What each user step took out, minus what is on the page now: the
          // sync's own steps in between (an unlink) are not the person's.
          const now = taskItemIds(newState.doc);
          const gone = new Set<string>();
          for (const tr of user) {
            for (const id of removedTaskIds(tr.before, tr.doc)) {
              if (!now.has(id)) gone.add(id);
            }
          }
          if (gone.size) handler([...gone]);
          return null;
        },
      }),
    ];
  },
});
