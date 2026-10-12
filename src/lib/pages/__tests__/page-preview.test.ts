import {
  PREVIEW_MAX_ROWS,
  PREVIEW_ROW_TEXT,
  PREVIEW_TOTAL_TEXT,
  type PreviewSourceBlock,
  buildPagePreview,
  cleanLine,
} from "@/lib/pages/page-preview";

const node = (json: unknown, type = "PARAGRAPH"): PreviewSourceBlock => ({
  type,
  content: { json },
});
const text = (value: string) => ({ type: "text", text: value });
const para = (value: string) => ({
  type: "paragraph",
  content: [text(value)],
});
const special = (kind: string, data: Record<string, unknown>) => ({
  type: "needtPageBlock",
  attrs: { kind, data: JSON.stringify(data) },
});

describe("buildPagePreview", () => {
  it("reduces each block type to the row the miniature draws", () => {
    const rows = buildPagePreview([
      node({ type: "heading", attrs: { level: 1 }, content: [text("One")] }),
      node({ type: "heading", attrs: { level: 2 }, content: [text("Two")] }),
      node({ type: "heading", attrs: { level: 3 }, content: [text("Three")] }),
      node(para("Body")),
      node({ type: "blockquote", content: [para("Said")] }),
      node({ type: "codeBlock", content: [text("let a = 1;\nlet b = 2;")] }),
      node({ type: "horizontalRule" }),
      node({ type: "image", attrs: { src: "https://x.test/a.png" } }),
      node(special("CALLOUT", { text: "Heads up" })),
    ]);
    expect(rows.slice(0, 8)).toEqual([
      { type: "h1", text: "One" },
      { type: "h2", text: "Two" },
      { type: "h3", text: "Three" },
      { type: "p", text: "Body" },
      { type: "quote", text: "Said" },
      { type: "code", text: "let a = 1;\nlet b = 2;" },
      { type: "rule", text: "" },
      { type: "image", text: "" },
    ]);
  });

  it("turns a list into one row per item and keeps ticked to-dos", () => {
    const rows = buildPagePreview([
      node({
        type: "bulletList",
        content: [
          { type: "listItem", content: [para("Apples")] },
          { type: "listItem", content: [para("Pears")] },
        ],
      }),
      node({
        type: "orderedList",
        content: [{ type: "listItem", content: [para("First")] }],
      }),
      node({
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: true },
            content: [para("Done")],
          },
          {
            type: "taskItem",
            attrs: { checked: false },
            content: [para("Open")],
          },
        ],
      }),
    ]);
    expect(rows).toEqual([
      { type: "li", text: "Apples" },
      { type: "li", text: "Pears" },
      { type: "ol", text: "First" },
      { type: "todo", text: "Done", checked: true },
      { type: "todo", text: "Open" },
    ]);
  });

  it("reads one level of nested list items after their parent", () => {
    const rows = buildPagePreview([
      node({
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              para("Parent"),
              {
                type: "bulletList",
                content: [{ type: "listItem", content: [para("Child")] }],
              },
            ],
          },
        ],
      }),
    ]);
    expect(rows.map((r) => r.text)).toEqual(["Parent", "Child"]);
  });

  it("joins marked-up and broken text into plain words", () => {
    const rows = buildPagePreview([
      node({
        type: "paragraph",
        content: [
          { type: "text", text: "Bold", marks: [{ type: "bold" }] },
          { type: "hardBreak" },
          { type: "text", text: "and " },
          {
            type: "text",
            text: "linked",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          },
        ],
      }),
    ]);
    expect(rows).toEqual([{ type: "p", text: "Bold and linked" }]);
  });

  it("draws a table as its first rows and special blocks by their data", () => {
    const rows = buildPagePreview([
      node({
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableCell", content: [para("a")] },
              { type: "tableCell", content: [para("b")] },
            ],
          },
        ],
      }),
      node(special("LEAD", { text: "Lead words" })),
      node(special("IMAGE", { url: "/api/x" })),
      node(special("DIVIDER", {})),
      node(special("FORM", { text: "ignored" })),
      node(special("PAGE_MENTION", { title: "Other page", url: "/pages/x" })),
    ]);
    expect(rows).toEqual([
      { type: "p", text: "a · b" },
      { type: "lead", text: "Lead words" },
      { type: "image", text: "" },
      { type: "rule", text: "" },
      { type: "p", text: "Other page" },
    ]);
  });

  it("reads the older text and html shapes by the block's own type", () => {
    const rows = buildPagePreview([
      { type: "HEADING_2", content: { text: "Legacy heading" } },
      { type: "BULLETED_LIST", content: { text: "Legacy bullet" } },
      {
        type: "QUOTE",
        content: { html: "<p>Cut &amp; <b>pasted</b><script>x()</script></p>" },
      },
      { type: "DIVIDER", content: {} },
      { type: "TABLE", content: { text: "not drawn" } },
    ]);
    expect(rows).toEqual([
      { type: "h2", text: "Legacy heading" },
      { type: "li", text: "Legacy bullet" },
      { type: "quote", text: "Cut & pasted x()" },
      { type: "rule", text: "" },
    ]);
  });

  it("uses the first text of a block that was too large to read", () => {
    expect(
      buildPagePreview([
        { type: "PARAGRAPH", content: null, firstText: "Start of a huge one" },
        { type: "DIVIDER", content: null },
      ])
    ).toEqual([
      { type: "p", text: "Start of a huge one" },
      { type: "rule", text: "" },
    ]);
  });

  it("is empty for an empty page and skips blank blocks", () => {
    expect(buildPagePreview([])).toEqual([]);
    expect(
      buildPagePreview([
        node({ type: "paragraph" }),
        node(para("   ")),
        { type: "PARAGRAPH", content: { text: "" } },
        { type: "PARAGRAPH", content: 42 },
        { type: "PARAGRAPH", content: null },
      ])
    ).toEqual([]);
  });

  it("clips a row, the whole preview and the row count", () => {
    const long = "word ".repeat(80);
    const [first] = buildPagePreview([node(para(long))]);
    expect(first.text.length).toBeLessThanOrEqual(PREVIEW_ROW_TEXT);
    expect(first.text.endsWith("…")).toBe(true);

    const many = buildPagePreview(
      Array.from({ length: 30 }, (_, i) => node(para(`Row ${i}`)))
    );
    expect(many).toHaveLength(PREVIEW_MAX_ROWS);

    const wide = buildPagePreview(
      Array.from({ length: 30 }, () => node(para("y".repeat(200))))
    );
    const total = wide.reduce((n, r) => n + r.text.length, 0);
    expect(total).toBeLessThanOrEqual(PREVIEW_TOTAL_TEXT);
    expect(wide.length).toBeLessThan(PREVIEW_MAX_ROWS);
  });

  it("never splits a surrogate pair when it clips", () => {
    const emoji = "😀".repeat(100);
    const [row] = buildPagePreview([node(para(emoji))]);
    expect(row.text.endsWith("…")).toBe(true);
    // Every code unit before the ellipsis belongs to a whole pair.
    expect(row.text.slice(0, -1)).toMatch(/^(?:😀)+$/u);
  });

  it("strips control characters and direction overrides", () => {
    const [row] = buildPagePreview([node(para("a\u0000b\u0007c‮d⁦e​f\tg\nh"))]);
    expect(row.text).toBe("a b cdef g h");
    expect(cleanLine("\u001b[31mred\u009f")).toBe("[31mred");
  });

  it("keeps a few lines of code and drops the rest", () => {
    const [row] = buildPagePreview([
      node({
        type: "codeBlock",
        content: [text("\n\nl1\r\nl2\u0000\nl3\nl4\nl5")],
      }),
    ]);
    expect(row).toEqual({ type: "code", text: "l1\nl2\nl3" });
  });

  it("returns plain data only: no markup is ever produced", () => {
    const rows = buildPagePreview([
      node(para('<img src=x onerror="alert(1)"> <b>hi</b>')),
    ]);
    // The text is carried as written (React escapes it); it is never HTML.
    expect(rows).toEqual([
      { type: "p", text: '<img src=x onerror="alert(1)"> <b>hi</b>' },
    ]);
    expect(Object.keys(rows[0]).sort()).toEqual(["text", "type"]);
  });

  it("survives hostile shapes", () => {
    const deep: Record<string, unknown> = { type: "paragraph" };
    let cursor = deep;
    for (let i = 0; i < 200; i++) {
      const next: Record<string, unknown> = { type: "bold" };
      cursor.content = [next];
      cursor = next;
    }
    cursor.content = [text("far down")];
    expect(() =>
      buildPagePreview([
        node(deep),
        node({ type: "heading", attrs: { level: "nope" } }),
        node({ type: "needtPageBlock", attrs: { data: "{broken" } }),
        node(null),
        node([1, 2]),
        { type: "PARAGRAPH", content: { json: "string" } },
      ])
    ).not.toThrow();
  });
});
