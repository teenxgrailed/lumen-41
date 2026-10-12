import type { JSONContent } from "@tiptap/core";

import { blockTypeForNode } from "@/components/pages/page-document";

import { pageEditorSchema } from "@/lib/pages/page-editor-schema";

import {
  type BuildDeps,
  type NoteCode,
  buildPageBlocks,
  splitNotionMarkdown,
} from "../notion/markdown";
import {
  calloutMd,
  codeMd,
  columnsMd,
  equationMd,
  listsMd,
  mediaMd,
  mentionsMd,
  referencesMd,
  syncedMd,
  tableMd,
  toggleMd,
  unknownMd,
} from "./fixtures/notion/markdown";

const LOCAL: Record<string, { localId: string; title: string }> = {
  "22222222-2222-4222-8222-222222222222": {
    localId: "local-roadmap",
    title: "Roadmap",
  },
  "77777777-7777-4777-8777-777777777777": {
    localId: "local-db",
    title: "Tasks DB",
  },
};
const idOf = (url: string) => /([0-9a-f]{32})/.exec(url)?.[1] ?? "";
const dashed = (hex: string) =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
const lookup = (url: string) => LOCAL[dashed(idOf(url))] ?? null;

function harness() {
  const notes: Array<[NoteCode, string | undefined]> = [];
  const deps: BuildDeps = {
    note: (code, detail) => notes.push([code, detail]),
    hrefFor: (url) => {
      const found = lookup(url);
      return found ? `/pages/${found.localId}` : null;
    },
    pageFor: lookup,
    resolveFile: async ({ url, caption }) => ({
      url: url.startsWith("https://prod-files")
        ? `/api/pages/p/assets/${encodeURIComponent(caption || "a")}`
        : url,
      name: caption || "file",
      ...(url.startsWith("https://prod-files") ? { assetId: "asset-1" } : {}),
    }),
    resolveUnknown: async ({ alt }) =>
      alt === "bookmark"
        ? {
            kind: "bookmark",
            url: "https://example.com/article",
            title: "Article",
          }
        : alt === "embed"
          ? { kind: "link", url: "https://example.com/embed", title: "Embed" }
          : { kind: "skip" },
  };
  return { deps, notes };
}

async function convert(markdown: string) {
  const { deps, notes } = harness();
  const blocks = await buildPageBlocks(
    splitNotionMarkdown(markdown, deps),
    deps
  );
  return { blocks, notes };
}

const json = (block: { content: unknown }) =>
  (block.content as { json: JSONContent }).json;
const kindOf = (node: JSONContent) =>
  node.type === "needtPageBlock" ? String(node.attrs?.kind) : node.type;
const data = (node: JSONContent) =>
  JSON.parse(String(node.attrs?.data)) as Record<string, unknown>;
const text = (node: JSONContent): string =>
  node.text ?? (node.content ?? []).map(text).join("");

describe("Notion markdown to page blocks", () => {
  it("turns a callout into a CALLOUT block and keeps the rest as blocks", async () => {
    const { blocks } = await convert(calloutMd);
    const nodes = blocks.map(json);
    expect(nodes.map(kindOf)).toEqual([
      "paragraph",
      "CALLOUT",
      "paragraph",
      "paragraph",
    ]);
    expect(data(nodes[1])).toEqual({
      text: "Ship the MVP by Friday.",
      icon: "💡",
    });
    expect(text(nodes[2])).toBe("Second line of the callout.");
    expect(blocks.map((b) => b.type)).toEqual([
      "PARAGRAPH",
      "CALLOUT",
      "PARAGRAPH",
      "PARAGRAPH",
    ]);
  });

  it("turns details/summary into a TOGGLE and dedents the children of toggle headings", async () => {
    const { blocks } = await convert(toggleMd);
    const nodes = blocks.map(json);
    expect(nodes.map(kindOf)).toEqual([
      "TOGGLE",
      "paragraph",
      "bulletList",
      "heading",
      "paragraph",
    ]);
    expect(data(nodes[0])).toEqual({ text: "More detail" });
    expect(text(nodes[1])).toBe("Hidden paragraph one.");
    expect(text(nodes[3])).toBe("Open heading");
    // The child is a paragraph, not an indented code block.
    expect(text(nodes[4])).toBe("Child of the toggle heading.");
    expect(blocks[0].type).toBe("TOGGLE");
  });

  it("flattens columns in reading order", async () => {
    const { blocks } = await convert(columnsMd);
    const nodes = blocks.map(json);
    expect(nodes.map(kindOf)).toEqual(["paragraph", "bulletList", "paragraph"]);
    expect(nodes.map(text)).toEqual([
      "Left column text.",
      "left bullet",
      "Right column text.",
    ]);
  });

  it("keeps nested lists and task lists", async () => {
    const { blocks } = await convert(listsMd);
    const nodes = blocks.map(json);
    expect(nodes.map(kindOf)).toEqual([
      "bulletList",
      "orderedList",
      "taskList",
    ]);
    const parent = nodes[0].content?.[0];
    expect(parent?.content?.map((n) => n.type)).toEqual([
      "paragraph",
      "bulletList",
    ]);
    const children = parent?.content?.[1].content ?? [];
    expect(children).toHaveLength(2);
    expect(children[0].content?.[1].type).toBe("bulletList");
    expect(nodes[2].content?.map((n) => n.attrs?.checked)).toEqual([
      false,
      true,
    ]);
    expect(blocks.map((b) => b.type)).toEqual([
      "BULLETED_LIST",
      "NUMBERED_LIST",
      "CHECKLIST",
    ]);
  });

  it("builds a table from <table> with cell formatting and an escaped pipe", async () => {
    const { blocks } = await convert(tableMd);
    const table = json(blocks[0]);
    expect(table.type).toBe("table");
    const rows = table.content ?? [];
    expect(rows).toHaveLength(2);
    expect(rows[0].content?.map((c) => c.type)).toEqual([
      "tableHeader",
      "tableHeader",
    ]);
    expect(rows[1].content?.map((c) => text(c))).toEqual(["Apples | red", "3"]);
  });

  it("leaves code literal, tags and dollar signs included", async () => {
    const { blocks, notes } = await convert(codeMd);
    const nodes = blocks.map(json);
    expect(nodes.map(kindOf)).toEqual(["codeBlock", "paragraph"]);
    expect(text(nodes[0])).toContain("<callout>not a tag</callout>");
    expect(text(nodes[0])).toContain("$5 and $6");
    expect(notes).toEqual([]);
  });

  it("turns equations into code with a note", async () => {
    const { blocks, notes } = await convert(equationMd);
    const nodes = blocks.map(json);
    expect(nodes[0].type).toBe("codeBlock");
    expect(nodes[0].attrs?.language).toBe("latex");
    expect(text(nodes[0])).toBe("E = mc^2");
    // Inline math becomes inline code; an escaped dollar stays money.
    const paragraph = nodes[1];
    expect(
      paragraph.content?.some(
        (n) => n.marks?.some((m) => m.type === "code") && n.text === "a+b"
      )
    ).toBe(true);
    expect(text(paragraph)).toContain("$5 money");
    expect(notes.filter(([code]) => code === "equation")).toHaveLength(2);
  });

  it("resolves mentions, spans, dates and breaks", async () => {
    const link = "https://www.notion.so/22222222222242228222222222222222";
    const { blocks, notes } = await convert(
      mentionsMd.replace("PAGE_B_URL", link)
    );
    const paragraph = json(blocks[0]);
    expect(text(paragraph)).toContain("@Ada");
    expect(text(paragraph)).toContain("2026-10-20 → 2026-10-22");
    expect(text(paragraph)).toContain("Red and underlined text");
    const links = (paragraph.content ?? [])
      .flatMap((n) => n.marks ?? [])
      .filter((m) => m.type === "link");
    expect(links.map((m) => m.attrs?.href)).toEqual([
      "/pages/local-roadmap",
      "https://www.notion.so/ffffffffffffffffffffffffffffffff",
    ]);
    expect(paragraph.content?.some((n) => n.type === "hardBreak")).toBe(true);
    expect(notes).toEqual([["link_unresolved", "Gone"]]);
  });

  it("turns page and database references into PAGE_MENTION blocks, unresolved ones into links", async () => {
    const { blocks, notes } = await convert(
      referencesMd(
        "https://www.notion.so/22222222222242228222222222222222",
        "https://www.notion.so/77777777777747778777777777777777"
      )
    );
    const nodes = blocks.map(json);
    expect(nodes.map(kindOf)).toEqual(["PAGE_MENTION", "PAGE_MENTION", "LINK"]);
    expect(data(nodes[0])).toEqual({
      pageId: "local-roadmap",
      title: "Roadmap",
      url: "/pages/local-roadmap",
    });
    expect(data(nodes[1])).toMatchObject({
      pageId: "local-db",
      url: "/pages/local-db",
    });
    expect(data(nodes[2])).toMatchObject({
      url: expect.stringContaining("notion.so"),
      title: "Unshared child",
    });
    expect(notes).toEqual([["link_unresolved", "Unshared child"]]);
    expect(blocks.map((b) => b.type)).toEqual([
      "PAGE_MENTION",
      "PAGE_MENTION",
      "LINK",
    ]);
  });

  it("turns media tags and images into IMAGE and FILE blocks", async () => {
    const { blocks } = await convert(
      mediaMd(
        "https://prod-files-secure.s3.us-west-2.amazonaws.com/a/b.png?X-Amz-Signature=1",
        "https://prod-files-secure.s3.us-west-2.amazonaws.com/a/c.pdf?X-Amz-Signature=2"
      )
    );
    const nodes = blocks.map(json);
    expect(nodes.map(kindOf)).toEqual(["IMAGE", "FILE", "FILE", "IMAGE"]);
    expect(data(nodes[0])).toMatchObject({
      url: "/api/pages/p/assets/A%20diagram",
      assetId: "asset-1",
      name: "A diagram",
    });
    expect(data(nodes[1])).toMatchObject({
      name: "Spec sheet",
      assetId: "asset-1",
    });
    expect(data(nodes[2])).toMatchObject({
      url: "https://example.com/video.mp4",
      name: "Demo",
    });
    expect(data(nodes[3])).toMatchObject({
      url: "https://images.example.com/photo.jpg",
    });
    expect(blocks.map((b) => b.type)).toEqual([
      "IMAGE",
      "FILE",
      "FILE",
      "IMAGE",
    ]);
  });

  it("resolves unknown bookmark and embed blocks and drops the rest", async () => {
    const { blocks } = await convert(
      unknownMd(
        "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
      )
    );
    const nodes = blocks.map(json);
    expect(nodes.map(kindOf)).toEqual(["BOOKMARK", "LINK"]);
    expect(data(nodes[0])).toEqual({
      url: "https://example.com/article",
      title: "Article",
    });
    expect(blocks.map((b) => b.type)).toEqual(["BOOKMARK", "LINK"]);
  });

  it("flattens synced blocks with a note and drops contents tags it cannot show", async () => {
    const { blocks, notes } = await convert(syncedMd);
    expect(blocks.map(json).map(text)).toEqual(["Shared text."]);
    expect(notes).toEqual([
      ["synced_block", undefined],
      ["unsupported_block", "custom-block"],
    ]);
  });

  it("strips block attribute lists and keeps headings and quotes with children as siblings", async () => {
    const { blocks } = await convert(
      [
        '## Heading {color="blue"}',
        '> Quoted {color="gray"}',
        "\tchild of quote",
        "Plain",
      ].join("\n")
    );
    const nodes = blocks.map(json);
    expect(nodes.map(kindOf)).toEqual([
      "heading",
      "blockquote",
      "paragraph",
      "paragraph",
    ]);
    expect(text(nodes[0])).toBe("Heading");
    expect(text(nodes[1])).toBe("Quoted");
    expect(blocks[0].type).toBe("HEADING_2");
  });

  it("only ever produces nodes the page editor schema accepts, with a type for each", async () => {
    const all = [
      calloutMd,
      toggleMd,
      columnsMd,
      listsMd,
      tableMd,
      codeMd,
      equationMd,
      syncedMd,
      mediaMd("https://x.example/a.png", "https://x.example/a.pdf"),
    ].join("\n");
    const { blocks } = await convert(all);
    expect(blocks.length).toBeGreaterThan(10);
    for (const block of blocks) {
      const node = json(block);
      expect(() => pageEditorSchema.nodeFromJSON(node).check()).not.toThrow();
      expect(block.type).toBe(blockTypeForNode(node));
    }
  });

  it("yields no blocks for a table without rows", async () => {
    const { blocks } = await convert("<table>\n</table>");
    expect(blocks).toEqual([]);
  });
});
