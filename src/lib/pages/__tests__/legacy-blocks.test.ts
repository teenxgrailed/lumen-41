import { pageBlocksToCollaborationState } from "@/services/pages/page-collaboration-document";
import type { JSONContent } from "@tiptap/core";

import {
  documentFromPageBlocks,
  pageBlocksFromDocument,
} from "@/components/pages/page-document";

import { LEGACY_PAGE_BLOCKS } from "@/lib/pages/__tests__/fixtures/legacy-blocks";
import {
  isLegacySpecialBlock,
  upgradeLegacyDocument,
  upgradeLegacyNode,
} from "@/lib/pages/legacy-blocks";
import { pageEditorSchema } from "@/lib/pages/page-editor-schema";

describe("old Callout, Toggle and Columns atoms", () => {
  it("are read as the real blocks, keeping their ids and text", () => {
    const doc = documentFromPageBlocks(LEGACY_PAGE_BLOCKS)!;
    const [callout, toggle, columns, link, emptyCallout] = doc.content!;

    expect(callout.type).toBe("needtCallout");
    expect(callout.attrs).toMatchObject({
      blockId: "old-callout",
      icon: "💡",
      color: "default",
    });
    expect(callout.content?.[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "Ship on the 26th" }],
    });

    expect(toggle.type).toBe("needtToggle");
    expect(toggle.attrs?.blockId).toBe("old-toggle");
    expect(toggle.content?.[0].content?.[0].text).toBe("Release notes");

    expect(columns.type).toBe("needtColumns");
    expect(columns.content).toHaveLength(2);
    expect(columns.content?.map((c) => c.attrs?.width)).toEqual([50, 50]);

    // Other special blocks are untouched.
    expect(link.type).toBe("needtPageBlock");
    // An empty callout is still a callout with an empty paragraph to type in.
    expect(emptyCallout.content).toEqual([{ type: "paragraph" }]);
  });

  it("produce documents the schema accepts", () => {
    const doc = documentFromPageBlocks(LEGACY_PAGE_BLOCKS)!;
    const node = pageEditorSchema.nodeFromJSON(doc);
    expect(() => node.check()).not.toThrow();
  });

  it("save as the real block types, with the same ids", () => {
    const doc = documentFromPageBlocks(LEGACY_PAGE_BLOCKS)!;
    const saved = pageBlocksFromDocument(doc);
    expect(saved.map((b) => [b.id, b.type])).toEqual([
      ["old-callout", "CALLOUT"],
      ["old-toggle", "TOGGLE"],
      ["old-columns", "COLUMNS"],
      ["old-link", "LINK"],
      ["old-empty-callout", "CALLOUT"],
    ]);
    // Saved once, reading again changes nothing.
    const again = documentFromPageBlocks(
      saved.map((b) => ({ ...b, createdBy: "HUMAN" })) as never
    )!;
    expect(again).toEqual(doc);
  });

  it("fill the collaboration document with the real blocks", () => {
    const state = pageBlocksToCollaborationState(LEGACY_PAGE_BLOCKS);
    expect(state.byteLength).toBeGreaterThan(0);
  });

  it("three columns are kept when the old label says so", () => {
    const upgraded = upgradeLegacyNode({
      type: "needtPageBlock",
      attrs: { kind: "COLUMNS", data: '{"title":"Three columns"}' },
    });
    expect(upgraded.content).toHaveLength(3);
  });

  it("survive bad data", () => {
    for (const data of ["not json", "[]", "null", "42", "x".repeat(30_000)]) {
      const upgraded = upgradeLegacyNode({
        type: "needtPageBlock",
        attrs: { kind: "CALLOUT", data },
      });
      expect(upgraded.type).toBe("needtCallout");
      expect(upgraded.content).toEqual([{ type: "paragraph" }]);
    }
  });

  it("leave every other node and document alone", () => {
    const paragraph: JSONContent = { type: "paragraph" };
    expect(upgradeLegacyNode(paragraph)).toBe(paragraph);
    expect(isLegacySpecialBlock(paragraph)).toBe(false);
    const doc: JSONContent = { type: "doc", content: [paragraph] };
    expect(upgradeLegacyDocument(doc)).toBe(doc);
  });
});
