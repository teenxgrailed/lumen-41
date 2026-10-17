import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Marks one top-level block (found by its `blockId`) with `data-block-flash`
 * for a moment, as a decoration. A block opened by its link (`#blockId`) is
 * scrolled to and flashed this way; setting the attribute straight on the DOM
 * does not hold, because ProseMirror re-reads an attribute change as an edit.
 */
export const blockFlashKey = new PluginKey<string | null>("blockFlash");

export const BlockFlash = Extension.create({
  name: "blockFlash",
  addProseMirrorPlugins() {
    return [
      new Plugin<string | null>({
        key: blockFlashKey,
        state: {
          init: () => null,
          apply: (tr, value) => {
            const meta = tr.getMeta(blockFlashKey) as
              | { id: string | null }
              | undefined;
            return meta ? meta.id : value;
          },
        },
        props: {
          decorations(state) {
            const id = blockFlashKey.getState(state);
            if (!id) return null;
            const decorations: Decoration[] = [];
            state.doc.forEach((node, offset) => {
              if (node.attrs.blockId === id) {
                decorations.push(
                  Decoration.node(offset, offset + node.nodeSize, {
                    "data-block-flash": "",
                  })
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
