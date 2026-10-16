import {
  type PagePreviewBlock,
  buildPagePreview,
} from "@/lib/pages/page-preview";

/**
 * Top-level blocks read for a preview: the list route's own
 * `PREVIEW_BLOCKS_PER_PAGE` (page-preview-service.ts, which imports the
 * database and cannot be imported here).
 */
export const LIVE_PREVIEW_BLOCKS = 12;

/** What the editor's document gives: its top-level nodes, in order. */
export interface PreviewDocLike {
  childCount: number;
  child(index: number): { toJSON(): unknown };
}

/**
 * The card miniature of the page being edited, from the editor's own
 * document: the same reduction the list route runs on the stored blocks
 * (`buildPagePreview`), over the same first blocks. The Docs grid, the
 * sidebar's Pinned faces and the rail thumb follow an edit with this instead
 * of waiting for the collaboration server to store the page and the list to
 * be fetched again.
 *
 * Reads only the first blocks, never the whole page.
 */
export function previewOfDocument(doc: PreviewDocLike): PagePreviewBlock[] {
  const count = Math.min(doc.childCount, LIVE_PREVIEW_BLOCKS);
  const blocks = [];
  for (let i = 0; i < count; i += 1) {
    // The stored `type` column is only read when a block has no node; these
    // always have one.
    blocks.push({
      type: "PARAGRAPH",
      content: { json: doc.child(i).toJSON() },
    });
  }
  return buildPagePreview(blocks);
}
