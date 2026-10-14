import { pageBlocksFromText } from "@/services/pages/page-text-blocks";

import { pageEditorSchema } from "@/lib/pages/page-editor-schema";

function nodes(blocks: ReturnType<typeof pageBlocksFromText>) {
  return blocks.map(
    (block) => (block.content as { json: Record<string, unknown> }).json
  );
}

describe("pageBlocksFromText", () => {
  it("turns Markdown into editor blocks the page schema accepts", () => {
    const blocks = pageBlocksFromText(
      [
        "# Plan",
        "First line",
        "second line",
        "",
        "- one",
        "- two",
        "1. first",
        "- [x] done",
        "- [ ] open",
        "> quoted",
        "---",
        "```ts",
        "const a = 1;",
        "```",
        "#### deep",
      ].join("\n")
    );
    expect(blocks.map((block) => block.type)).toEqual([
      "HEADING_1",
      "PARAGRAPH",
      "BULLETED_LIST",
      "NUMBERED_LIST",
      "CHECKLIST",
      "QUOTE",
      "DIVIDER",
      "CODE",
      "HEADING_3",
    ]);
    expect(blocks.every((block) => block.createdBy === "AI")).toBe(true);
    // Throws if any node does not fit the editor schema.
    pageEditorSchema
      .nodeFromJSON({ type: "doc", content: nodes(blocks) })
      .check();
  });

  it("writes one paragraph per non-empty line in plain mode", () => {
    const blocks = pageBlocksFromText("# not a heading\n\nsecond", "plain");
    expect(blocks.map((block) => block.type)).toEqual([
      "PARAGRAPH",
      "PARAGRAPH",
    ]);
    expect(nodes(blocks)[0]).toMatchObject({
      content: [{ type: "text", text: "# not a heading" }],
    });
  });

  it("returns nothing for blank text", () => {
    expect(pageBlocksFromText(" \n\n ")).toEqual([]);
  });
});
