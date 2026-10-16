import { LIVE_PREVIEW_BLOCKS, previewOfDocument } from "../live-preview";

/** The editor's document, as far as the preview reads it. */
const docOf = (...nodes: unknown[]) => ({
  childCount: nodes.length,
  child: (index: number) => ({ toJSON: () => nodes[index] }),
});

const text = (t: string) => ({ type: "text", text: t });
const para = (t?: string) => ({
  type: "paragraph",
  attrs: { blockId: "b" },
  content: t ? [text(t)] : undefined,
});
const checklist = (...items: [string, boolean][]) => ({
  type: "taskList",
  attrs: { blockId: "c" },
  content: items.map(([t, checked]) => ({
    type: "taskItem",
    attrs: { checked },
    content: [para(t)],
  })),
});

describe("previewOfDocument", () => {
  it("draws a page that is only a checklist (the Buy-list case)", () => {
    expect(
      previewOfDocument(
        docOf(
          checklist(["Milk", false], ["Eggs", true], ["Coffee beans", false])
        )
      )
    ).toEqual([
      { type: "todo", text: "Milk" },
      { type: "todo", text: "Eggs", checked: true },
      { type: "todo", text: "Coffee beans" },
    ]);
  });

  it("skips an empty first paragraph and keeps going", () => {
    expect(
      previewOfDocument(docOf(para(), para(), checklist(["Milk", false])))
    ).toEqual([{ type: "todo", text: "Milk" }]);
  });

  it("is empty for an empty page", () => {
    expect(previewOfDocument(docOf(para()))).toEqual([]);
    expect(previewOfDocument(docOf())).toEqual([]);
  });

  it("reads only the first blocks of a long page", () => {
    const read = jest.fn();
    const long = {
      childCount: 5_000,
      child: (index: number) => {
        read(index);
        return { toJSON: () => para(`line ${index}`) };
      },
    };
    const rows = previewOfDocument(long);
    expect(read).toHaveBeenCalledTimes(LIVE_PREVIEW_BLOCKS);
    expect(rows.length).toBeLessThanOrEqual(8);
    expect(rows[0]).toEqual({ type: "p", text: "line 0" });
  });
});
