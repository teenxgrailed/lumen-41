import { Node, mergeAttributes } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";

import { cleanWidth, equalWidths, resizeWidths } from "./columns-ops";

/**
 * Columns: two or three side by side, each holding ordinary blocks. A column's
 * `width` is its share of the row (percent). Dragging the divider between two
 * columns trades width between those two; the "2 | 3" control adds or folds
 * the third column (its blocks move to the second, nothing is deleted).
 */
export const Column = Node.create({
  name: "needtColumn",
  content: "block+",
  isolating: true,

  addAttributes() {
    return {
      width: {
        default: 50,
        parseHTML: (element: HTMLElement) =>
          cleanWidth(element.getAttribute("data-width")),
        renderHTML: (attributes: Record<string, unknown>) => {
          const width = cleanWidth(attributes.width);
          return { "data-width": String(width), style: `--w:${width}` };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-needt-column]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-needt-column": "",
        class: "needt-column",
      }),
      0,
    ];
  },
});

function widthsOf(node: ProseMirrorNode): number[] {
  const widths: number[] = [];
  node.forEach((child) => widths.push(cleanWidth(child.attrs.width)));
  return widths;
}

export const Columns = Node.create({
  name: "needtColumns",
  group: "block",
  content: "needtColumn{2,3}",
  isolating: true,
  defining: true,

  parseHTML() {
    return [{ tag: "div[data-needt-columns]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-needt-columns": "",
        class: "needt-columns",
      }),
      0,
    ];
  },

  addNodeView() {
    return ({ node: initial, getPos, editor }) => {
      let node = initial;
      const dom = document.createElement("div");
      dom.className = "needt-columns-wrap";
      dom.setAttribute("data-needt-columns", "");
      const row = document.createElement("div");
      row.className = "needt-columns";
      const handles = document.createElement("div");
      handles.className = "needt-columns-handles";
      handles.contentEditable = "false";
      const bar = document.createElement("div");
      bar.className = "needt-columns-bar";
      bar.contentEditable = "false";
      dom.append(row, handles, bar);

      const pos = () => (typeof getPos === "function" ? getPos() : undefined);

      /** Write new widths to the columns in one step. */
      const commit = (widths: number[]) => {
        const start = pos();
        if (start === undefined) return;
        const tr = editor.state.tr;
        node.forEach((child, offset, index) => {
          const width = widths[index];
          if (width !== undefined && width !== child.attrs.width) {
            tr.setNodeMarkup(start + 1 + offset, undefined, {
              ...child.attrs,
              width,
            });
          }
        });
        if (tr.docChanged) editor.view.dispatch(tr);
      };

      const setCount = (count: 2 | 3) => {
        const start = pos();
        if (start === undefined || node.childCount === count) return;
        const { schema } = editor.state;
        const column = schema.nodes.needtColumn;
        const widths = equalWidths(count);
        const children: ProseMirrorNode[] = [];
        node.forEach((child) => children.push(child));
        let next: ProseMirrorNode[];
        if (count === 3) {
          next = [
            ...children,
            column.createAndFill({ width: widths[2] }) as ProseMirrorNode,
          ];
        } else {
          const [first, second, third] = children;
          const merged = column.create(
            second.attrs,
            second.content.append(third.content)
          );
          next = [first, merged];
        }
        const columns = next.map((child, i) =>
          child.type.create({ ...child.attrs, width: widths[i] }, child.content)
        );
        editor.view.dispatch(
          editor.state.tr.replaceWith(
            start + 1,
            start + node.nodeSize - 1,
            Fragment.fromArray(columns)
          )
        );
      };

      // "2 | 3" control
      const countButtons = [2, 3].map((n) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = String(n);
        button.setAttribute("data-columns-count", String(n));
        button.setAttribute("aria-label", `${n} columns`);
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", () => {
          if (editor.isEditable) setCount(n as 2 | 3);
        });
        bar.append(button);
        return button;
      });

      let dragging = false;
      const paint = () => {
        const widths = widthsOf(node);
        const total = widths.reduce((sum, w) => sum + w, 0) || 100;
        bar.hidden = !editor.isEditable;
        for (const button of countButtons) {
          button.setAttribute(
            "aria-pressed",
            String(Number(button.textContent) === node.childCount)
          );
        }
        handles.replaceChildren();
        if (!editor.isEditable) return;
        let running = 0;
        widths.slice(0, -1).forEach((width, index) => {
          running += width;
          const handle = document.createElement("div");
          handle.className = "needt-columns-handle";
          handle.setAttribute("role", "separator");
          handle.setAttribute("aria-orientation", "vertical");
          handle.setAttribute("aria-label", "Resize columns");
          handle.tabIndex = 0;
          handle.setAttribute("data-handle", String(index));
          handle.style.left = `${(running / total) * 100}%`;
          attachDrag(handle, index);
          handles.append(handle);
        });
      };

      const attachDrag = (handle: HTMLElement, index: number) => {
        handle.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          const startX = event.clientX;
          const rowWidth = row.getBoundingClientRect().width || 1;
          const start = widthsOf(node);
          const total = start.reduce((sum, w) => sum + w, 0) || 100;
          let latest = start;
          dragging = true;
          try {
            handle.setPointerCapture(event.pointerId);
          } catch {
            // Synthetic pointers have nothing to capture.
          }
          const live = (widths: number[]) => {
            widths.forEach((w, i) =>
              dom.style.setProperty(`--live-${i + 1}`, String(w))
            );
            let running = 0;
            widths.slice(0, -1).forEach((w, i) => {
              running += w;
              const target = handles.children[i] as HTMLElement | undefined;
              if (target) target.style.left = `${(running / total) * 100}%`;
            });
          };
          const move = (e: PointerEvent) => {
            const delta = ((e.clientX - startX) / rowWidth) * total;
            latest = resizeWidths(start, index, delta);
            live(latest);
          };
          const finish = () => {
            handle.removeEventListener("pointermove", move);
            handle.removeEventListener("pointerup", finish);
            handle.removeEventListener("pointercancel", finish);
            dragging = false;
            for (let i = 1; i <= 3; i += 1)
              dom.style.removeProperty(`--live-${i}`);
            commit(latest);
          };
          handle.addEventListener("pointermove", move);
          handle.addEventListener("pointerup", finish);
          handle.addEventListener("pointercancel", finish);
        });
        handle.addEventListener("keydown", (event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const step = event.key === "ArrowLeft" ? -2 : 2;
          commit(resizeWidths(widthsOf(node), index, step));
        });
      };

      paint();
      let wasEditable = editor.isEditable;
      const onTransaction = () => {
        if (editor.isEditable === wasEditable) return;
        wasEditable = editor.isEditable;
        paint();
      };
      editor.on("transaction", onTransaction);
      editor.on("update", onTransaction);

      return {
        dom,
        contentDOM: row,
        update(next) {
          if (next.type !== node.type) return false;
          node = next;
          if (!dragging) paint();
          return true;
        },
        ignoreMutation(mutation) {
          if (mutation.type === "selection") return false;
          return !row.contains(mutation.target as globalThis.Node);
        },
        stopEvent(event) {
          const target = event.target as globalThis.Node;
          return handles.contains(target) || bar.contains(target);
        },
        destroy() {
          editor.off("transaction", onTransaction);
          editor.off("update", onTransaction);
        },
      };
    };
  },
});
