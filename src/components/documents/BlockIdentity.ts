import { type Editor, Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

import { randomId } from "@/lib/uuid";

/**
 * Top-level node types that carry a stable `blockId` (comments, block links
 * and the API address blocks by it). Every name is a node in the page schema;
 * `needtPageBlock` declares its own `blockId` attribute, so it is not listed.
 * A test checks that each name here exists in the schema.
 */
export const IDENTITY_BLOCKS = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "image",
  "table",
];

export const BlockIdentity = Extension.create({
  name: "blockIdentity",
  addGlobalAttributes() {
    return [
      {
        types: IDENTITY_BLOCKS,
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-block-id"),
            renderHTML: (attributes) =>
              attributes.blockId
                ? { "data-block-id": String(attributes.blockId) }
                : {},
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (_transactions, _oldState, newState) => {
          const seen = new Set<string>();
          const transaction = newState.tr;
          let changed = false;
          newState.doc.forEach((node, offset) => {
            if (!node.type.spec.attrs?.blockId) return;
            const blockId =
              typeof node.attrs.blockId === "string" ? node.attrs.blockId : "";
            if (blockId && !seen.has(blockId)) {
              seen.add(blockId);
              return;
            }
            const nextId = randomId();
            seen.add(nextId);
            transaction.setNodeMarkup(offset, undefined, {
              ...node.attrs,
              blockId: nextId,
            });
            changed = true;
          });
          return changed ? transaction : null;
        },
      }),
    ];
  },
});

export function ensureBlockIds(editor: Editor) {
  let changed = false;
  const seen = new Set<string>();
  const transaction = editor.state.tr;
  editor.state.doc.forEach((node, offset) => {
    if (!node.type.spec.attrs?.blockId) return;
    const blockId =
      typeof node.attrs.blockId === "string" ? node.attrs.blockId : "";
    if (blockId && !seen.has(blockId)) {
      seen.add(blockId);
      return;
    }
    const nextId = randomId();
    seen.add(nextId);
    transaction.setNodeMarkup(offset, undefined, {
      ...node.attrs,
      blockId: nextId,
    });
    changed = true;
  });
  if (changed) editor.view.dispatch(transaction);
  return changed;
}
