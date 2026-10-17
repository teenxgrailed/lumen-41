import {
  copyTitle,
  duplicateBlocks,
  stripNodeIdentity,
} from "../duplicate-doc";

describe("copyTitle", () => {
  it("prefixes, names an empty page and clips", () => {
    expect(copyTitle("Plan")).toBe("Copy of Plan");
    expect(copyTitle("  ")).toBe("Copy of Untitled");
    expect(copyTitle(null)).toBe("Copy of Untitled");
    expect(copyTitle("x".repeat(400))).toHaveLength(240);
  });
});

describe("stripNodeIdentity", () => {
  it("drops block, task and due attrs at any depth and keeps the rest", () => {
    const node = {
      type: "taskList",
      attrs: { blockId: "b1" },
      content: [
        {
          type: "taskItem",
          attrs: { checked: true, taskId: "t1", taskDue: "2026-10-20" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Pay" }],
            },
          ],
        },
      ],
    };
    const out = stripNodeIdentity(node) as typeof node;
    expect(out.attrs).toEqual({});
    expect(out.content[0].attrs).toEqual({ checked: true });
    expect(out.content[0].content[0].content[0]).toEqual({
      type: "text",
      text: "Pay",
    });
    // The source is not touched.
    expect(node.content[0].attrs.taskId).toBe("t1");
  });

  it("passes plain values and arrays through", () => {
    expect(stripNodeIdentity("x")).toBe("x");
    expect(stripNodeIdentity(null)).toBeNull();
    expect(stripNodeIdentity([{ attrs: { blockId: "z", level: 2 } }])).toEqual([
      { attrs: { level: 2 } },
    ]);
  });
});

describe("duplicateBlocks", () => {
  it("keeps top-level blocks in reading order with fresh positions and no ids", () => {
    const out = duplicateBlocks([
      {
        id: "b2",
        type: "PARAGRAPH",
        position: 2048,
        content: { json: { type: "paragraph", attrs: { blockId: "b2" } } },
      },
      {
        id: "b1",
        type: "HEADING_1",
        position: 1024,
        content: {
          json: { type: "heading", attrs: { level: 1, blockId: "b1" } },
        },
      },
      {
        id: "child",
        type: "PARAGRAPH",
        position: 10,
        parentBlockId: "b1",
        content: { text: "nested" },
      },
    ]);
    expect(out.map((b) => b.type)).toEqual(["HEADING_1", "PARAGRAPH"]);
    expect(out.map((b) => b.position)).toEqual([1024, 2048]);
    expect(JSON.stringify(out)).not.toContain("blockId");
    expect(out.every((b) => !("id" in b))).toBe(true);
    expect(out[0].content).toEqual({
      json: { type: "heading", attrs: { level: 1 } },
    });
  });

  it("an empty page copies to one empty line", () => {
    expect(duplicateBlocks([])).toEqual([
      { type: "PARAGRAPH", content: { text: "" }, position: 1024 },
    ]);
  });
});
