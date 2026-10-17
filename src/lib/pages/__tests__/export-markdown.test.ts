import type { JSONContent } from "@tiptap/core";

import { LEGACY_PAGE_BLOCKS } from "@/lib/pages/__tests__/fixtures/legacy-blocks";
import {
  documentToMarkdown,
  escapeInline,
  exportFileName,
  pageToMarkdown,
  titledMarkdown,
} from "@/lib/pages/export-markdown";

const text = (value: string, marks?: JSONContent["marks"]): JSONContent => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});
const p = (...content: JSONContent[]): JSONContent => ({
  type: "paragraph",
  content,
});
const doc = (...content: JSONContent[]): JSONContent => ({
  type: "doc",
  content,
});
const md = (...content: JSONContent[]) => documentToMarkdown(doc(...content));

describe("text blocks", () => {
  it("writes headings, paragraphs and rules", () => {
    expect(
      md(
        { type: "heading", attrs: { level: 1 }, content: [text("One")] },
        p(text("Body")),
        { type: "heading", attrs: { level: 3 }, content: [text("Three")] },
        { type: "horizontalRule" }
      )
    ).toBe("# One\n\nBody\n\n### Three\n\n---");
  });

  it("skips empty paragraphs and headings", () => {
    expect(
      md(p(), { type: "heading", attrs: { level: 2 } }, p(text("x")))
    ).toBe("x");
  });

  it("writes every inline mark, in order, with spaces outside the markers", () => {
    expect(
      md(
        p(
          text("bold", [{ type: "bold" }]),
          text(" "),
          text(" it ", [{ type: "italic" }]),
          text("strike", [{ type: "strike" }]),
          text("under", [{ type: "underline" }]),
          text("hi", [{ type: "highlight", attrs: { color: "wine" } }]),
          text("blue", [{ type: "textColor", attrs: { color: "navy" } }])
        )
      )
    ).toBe("**bold**  *it* ~~strike~~<u>under</u>==hi==blue");
  });

  it("combines marks and writes code verbatim", () => {
    expect(
      md(
        p(
          text("x", [{ type: "bold" }, { type: "italic" }]),
          text(" "),
          text("a*b", [{ type: "code" }])
        )
      )
    ).toBe("***x*** `a*b`");
    // A backtick at an end of the code is padded so it stays code.
    expect(md(p(text("`x", [{ type: "code" }])))).toBe("`` `x ``");
  });

  it("writes a link only for an address the page allowlist accepts", () => {
    expect(
      md(
        p(
          text("ok", [
            { type: "link", attrs: { href: "https://example.com/a(b)" } },
          ]),
          text(" bad", [
            { type: "link", attrs: { href: "javascript:alert(1)" } },
          ])
        )
      )
    ).toBe("[ok](https://example.com/a(b%29) bad");
  });

  it("escapes characters Markdown would read as formatting", () => {
    expect(escapeInline("a*b_c[d]e`f~g<h\\")).toBe(
      "a\\*b\\_c\\[d\\]e\\`f\\~g&lt;h\\\\"
    );
    expect(md(p(text("# not a heading")))).toBe("\\# not a heading");
    expect(md(p(text("- not a list")))).toBe("\\- not a list");
    expect(md(p(text("1. not a list")))).toBe("1\\. not a list");
    expect(md(p(text("> not a quote")))).toBe("\\> not a quote");
  });

  it("keeps a hard break", () => {
    expect(md(p(text("a"), { type: "hardBreak" }, text("b")))).toBe("a  \nb");
  });
});

describe("lists, quotes, code", () => {
  const li = (...content: JSONContent[]): JSONContent => ({
    type: "listItem",
    content,
  });

  it("writes bullets, numbers and nested lists", () => {
    expect(
      md(
        {
          type: "bulletList",
          content: [
            li(p(text("a")), {
              type: "bulletList",
              content: [li(p(text("a1")))],
            }),
            li(p(text("b"))),
          ],
        },
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [li(p(text("x"))), li(p(text("y")))],
        }
      )
    ).toBe("- a\n  - a1\n- b\n\n3. x\n4. y");
  });

  it("writes a checklist with its state", () => {
    expect(
      md({
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: true },
            content: [p(text("done"))],
          },
          {
            type: "taskItem",
            attrs: { checked: false },
            content: [p(text("todo"))],
          },
        ],
      })
    ).toBe("- [x] done\n- [ ] todo");
  });

  it("writes a quote over several blocks", () => {
    expect(
      md({ type: "blockquote", content: [p(text("a")), p(text("b"))] })
    ).toBe("> a\n>\n> b");
  });

  it("writes code fences, longer when the code holds one", () => {
    expect(
      md({
        type: "codeBlock",
        attrs: { language: "ts" },
        content: [text("const a = 1;")],
      })
    ).toBe("```ts\nconst a = 1;\n```");
    expect(md({ type: "codeBlock", content: [text("```\ninner\n```")] })).toBe(
      "````\n```\ninner\n```\n````"
    );
  });
});

describe("tables", () => {
  const cell = (type: string, value: string): JSONContent => ({
    type,
    content: [p(text(value))],
  });
  it("writes a GFM table with its header row", () => {
    expect(
      md({
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [cell("tableHeader", "A"), cell("tableHeader", "B")],
          },
          {
            type: "tableRow",
            content: [cell("tableCell", "1"), cell("tableCell", "x|y")],
          },
        ],
      })
    ).toBe("| A | B |\n| --- | --- |\n| 1 | x\\|y |");
  });
  it("gives a table with no header an empty one", () => {
    expect(
      md({
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [cell("tableCell", "1"), cell("tableCell", "2")],
          },
        ],
      })
    ).toBe("|  |  |\n| --- | --- |\n| 1 | 2 |");
  });
});

describe("media and special blocks", () => {
  const special = (
    kind: string,
    data: Record<string, unknown>
  ): JSONContent => ({
    type: "needtPageBlock",
    attrs: { kind, data: JSON.stringify(data) },
  });

  it("writes images, files and links; refuses an unsafe address", () => {
    expect(
      documentToMarkdown(
        doc(
          special("IMAGE", { url: "/api/pages/p/assets/a1", name: "shot.png" }),
          special("FILE", { url: "/api/pages/p/assets/a2", name: "spec.pdf" }),
          special("LINK", { url: "https://example.com", text: "Example" }),
          special("LINK", { url: "javascript:alert(1)", text: "Nope" }),
          special("DATE_MENTION", { date: "2026-10-26" }),
          {
            type: "image",
            attrs: { src: "https://example.com/i.png", alt: "pic" },
          }
        ),
        { origin: "https://use.needt.app" }
      )
    ).toBe(
      [
        "![shot.png](https://use.needt.app/api/pages/p/assets/a1)",
        "[spec.pdf](https://use.needt.app/api/pages/p/assets/a2)",
        "[Example](https://example.com)",
        "Nope",
        "2026-10-26",
        "![pic](https://example.com/i.png)",
      ].join("\n\n")
    );
  });

  it("survives unreadable data", () => {
    expect(
      md({ type: "needtPageBlock", attrs: { kind: "LINK", data: "{" } })
    ).toBe("");
  });
});

describe("Callout, Toggle and Columns", () => {
  it("writes a callout as a quote with its icon", () => {
    expect(
      md({
        type: "needtCallout",
        attrs: { icon: "💡", color: "navy" },
        content: [p(text("Mind the gap"))],
      })
    ).toBe("> 💡 Mind the gap");
  });

  it("writes a toggle as <details>", () => {
    expect(
      md({
        type: "needtToggle",
        content: [p(text("Title")), p(text("Hidden"))],
      })
    ).toBe("<details>\n<summary>Title</summary>\n\nHidden\n\n</details>");
    expect(md({ type: "needtToggle", content: [p(text("Only"))] })).toBe(
      "<details>\n<summary>Only</summary>\n</details>"
    );
  });

  it("writes columns one after another", () => {
    expect(
      md({
        type: "needtColumns",
        content: [
          { type: "needtColumn", content: [p(text("left"))] },
          { type: "needtColumn", content: [p(text("right"))] },
        ],
      })
    ).toBe("left\n\nright");
  });

  it("reads the old atoms too (a page not yet saved in the new shape)", () => {
    const out = pageToMarkdown({ title: "Old", blocks: LEGACY_PAGE_BLOCKS });
    expect(out).toContain("> 💡 Ship on the 26th");
    expect(out).toContain("<summary>Release notes</summary>");
    expect(out).toContain("[https://example.com](https://example.com)");
  });
});

describe("a whole page", () => {
  it("starts with the title and ends with one newline", () => {
    const out = titledMarkdown("My *page*", doc(p(text("Hello"))));
    expect(out).toBe("# My \\*page\\*\n\nHello\n");
  });
  it("an empty page is just its title; an untitled empty one is a newline", () => {
    expect(titledMarkdown("Only", null)).toBe("# Only\n");
    expect(titledMarkdown("  ", null)).toBe("\n");
  });
});

describe("exportFileName", () => {
  it("is safe on every file system and keeps non-Latin titles", () => {
    expect(exportFileName("Plan: Q4 / launch?", "md")).toBe(
      "Plan-Q4-launch.md"
    );
    expect(exportFileName("Запуск 26 октября", "md")).toBe(
      "Запуск-26-октября.md"
    );
    expect(exportFileName("../../etc", "md")).toBe("etc.md");
    expect(exportFileName("", "md")).toBe("page.md");
    expect(exportFileName("😀😀", "md")).toBe("page.md");
    expect(exportFileName("x".repeat(300), "md").length).toBeLessThanOrEqual(
      83
    );
  });
});
