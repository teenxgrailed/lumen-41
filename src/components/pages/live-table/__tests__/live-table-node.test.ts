import {
  blockTypeForNode,
  pageBlocksFromDocument,
} from "@/components/pages/page-document";

import { documentToMarkdown } from "@/lib/pages/export-markdown";
import { pageEditorSchema } from "@/lib/pages/page-editor-schema";
import { buildPagePreview } from "@/lib/pages/page-preview";

const node = {
  type: "needtLiveTable",
  attrs: { blockId: "b1", tableId: "t1", title: "iPhone Vocal Mics" },
};

describe("needtLiveTable in the page document", () => {
  it("is part of the shared editor schema", () => {
    const parsed = pageEditorSchema.nodeFromJSON({
      type: "doc",
      content: [node],
    });
    expect(parsed.firstChild?.type.name).toBe("needtLiveTable");
    expect(parsed.firstChild?.attrs.tableId).toBe("t1");
  });

  it("is stored as a LIVE_TABLE block with its id kept", () => {
    expect(blockTypeForNode(node)).toBe("LIVE_TABLE");
    const [block] = pageBlocksFromDocument({ type: "doc", content: [node] });
    expect(block).toMatchObject({ id: "b1", type: "LIVE_TABLE" });
  });

  it("previews as its title", () => {
    expect(
      buildPagePreview([
        { type: "LIVE_TABLE", position: 1, content: { json: node } },
      ] as unknown as Parameters<typeof buildPagePreview>[0])
    ).toEqual([{ type: "p", text: "iPhone Vocal Mics" }]);
  });

  it("exports to Markdown as its title", () => {
    expect(documentToMarkdown({ type: "doc", content: [node] })).toBe(
      "**Table:** iPhone Vocal Mics"
    );
  });
});
