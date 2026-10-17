import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Toggle: a title line with blocks folded under it. The first child is the
 * title paragraph; everything after it is the body the arrow folds. Whether a
 * toggle is open is remembered per reader on this device (`localStorage`, by
 * block id), so folding never edits the page, never reaches collaborators, and
 * works on a page that is read-only for you.
 */
const STORAGE_PREFIX = "needt:toggle:";

export function readToggleOpen(blockId: unknown): boolean {
  if (typeof blockId !== "string" || !blockId) return true;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + blockId) !== "0";
  } catch {
    return true;
  }
}

export function writeToggleOpen(blockId: unknown, open: boolean) {
  if (typeof blockId !== "string" || !blockId) return;
  try {
    if (open) window.localStorage.removeItem(STORAGE_PREFIX + blockId);
    else window.localStorage.setItem(STORAGE_PREFIX + blockId, "0");
  } catch {
    // Private mode or blocked storage: the toggle still folds, just not for long.
  }
}

export const Toggle = Node.create({
  name: "needtToggle",
  group: "block",
  content: "paragraph block*",
  defining: true,

  parseHTML() {
    return [{ tag: "div[data-needt-toggle]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-needt-toggle": "",
        class: "needt-toggle",
      }),
      0,
    ];
  },

  addNodeView() {
    return ({ node: initial, getPos, editor }) => {
      let node = initial;
      const dom = document.createElement("div");
      dom.className = "needt-toggle";
      dom.setAttribute("data-needt-toggle", "");

      const arrow = document.createElement("button");
      arrow.type = "button";
      arrow.className = "needt-toggle-arrow";
      arrow.contentEditable = "false";
      const content = document.createElement("div");
      content.className = "needt-toggle-content";
      dom.append(arrow, content);

      let open = readToggleOpen(node.attrs.blockId);
      const paint = () => {
        dom.setAttribute("data-open", open ? "true" : "false");
        arrow.setAttribute("aria-expanded", open ? "true" : "false");
        arrow.setAttribute(
          "aria-label",
          open ? "Fold toggle" : "Unfold toggle"
        );
      };
      paint();

      const onArrow = (event: Event) => {
        event.preventDefault();
        open = !open;
        writeToggleOpen(node.attrs.blockId, open);
        paint();
        if (!open && editor.isEditable) {
          // A caret left inside the folded body would type into nothing.
          const pos = typeof getPos === "function" ? getPos() : undefined;
          const { from } = editor.state.selection;
          if (pos !== undefined && from > pos + node.child(0).nodeSize + 1) {
            editor.commands.setTextSelection(pos + node.child(0).nodeSize);
          }
        }
      };
      arrow.addEventListener("mousedown", (event) => event.preventDefault());
      arrow.addEventListener("click", onArrow);

      return {
        dom,
        contentDOM: content,
        update(next) {
          if (next.type !== node.type) return false;
          node = next;
          return true;
        },
        // The arrow's own attribute changes are not edits.
        ignoreMutation(mutation) {
          if (mutation.type === "selection") return false;
          return !content.contains(mutation.target as globalThis.Node);
        },
        stopEvent(event) {
          return arrow.contains(event.target as globalThis.Node);
        },
        destroy() {
          arrow.removeEventListener("click", onArrow);
        },
      };
    };
  },
});
