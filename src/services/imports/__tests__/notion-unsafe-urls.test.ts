import type { JSONContent } from "@tiptap/core";

import { runNotionImport } from "../notion/importer";
import {
  type BuildDeps,
  type NoteCode,
  type UnknownRef,
  buildPageBlocks,
  splitNotionMarkdown,
} from "../notion/markdown";
import type {
  NotionBlock,
  NotionMarkdown,
  NotionPage,
  NotionSource,
} from "../notion/types";
import { type ImportLimitGuard } from "../types";
import { createMemoryDb } from "./memory-store";

/**
 * Addresses in imported content are untrusted. A javascript: or data: address
 * never becomes a link, bookmark, file, image or cover: it ends up as plain
 * text with a `link_unsafe` note.
 */

const BAD = [
  "javascript:alert(1)",
  "data:text/html,%3Cscript%3Ealert(1)%3C/script%3E",
  "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
];

function harness(
  unknown: (url: string, alt: string) => UnknownRef = () => ({ kind: "skip" })
) {
  const notes: Array<[NoteCode, string | undefined]> = [];
  const deps: BuildDeps = {
    note: (code, detail) => notes.push([code, detail]),
    hrefFor: () => null,
    pageFor: () => null,
    resolveFile: async ({ url, caption }) => ({
      url,
      name: caption || "file",
    }),
    resolveUnknown: async ({ url, alt }) => unknown(url, alt),
  };
  return { deps, notes };
}

async function convert(
  markdown: string,
  unknown?: (url: string, alt: string) => UnknownRef
) {
  const { deps, notes } = harness(unknown);
  const blocks = await buildPageBlocks(
    splitNotionMarkdown(markdown, deps),
    deps
  );
  return { blocks, notes };
}

const json = (block: { content: unknown }) =>
  (block.content as { json: JSONContent }).json;
const serialized = (blocks: Array<{ content: unknown }>) =>
  JSON.stringify(blocks.map(json));
const unsafeNotes = (notes: Array<[NoteCode, string | undefined]>) =>
  notes.filter(([code]) => code === "link_unsafe").length;

describe("Notion markdown refuses unsafe addresses", () => {
  it.each(BAD)(
    "a markdown link to %s keeps its text and loses the link",
    async (url) => {
      const { blocks, notes } = await convert(`See [the docs](${url}) now.`);
      expect(serialized(blocks)).not.toMatch(/javascript:|data:/);
      expect(serialized(blocks)).not.toContain('"type":"link"');
      expect(serialized(blocks)).toContain("the docs");
      expect(unsafeNotes(notes)).toBe(1);
    }
  );

  it("keeps a safe markdown link", async () => {
    const { blocks, notes } = await convert(
      "See [docs](https://example.com/a)."
    );
    expect(serialized(blocks)).toContain('"type":"link"');
    expect(unsafeNotes(notes)).toBe(0);
  });

  it.each(BAD)(
    "an image line to %s becomes text, not an IMAGE block",
    async (url) => {
      const { blocks, notes } = await convert(`![Diagram](${url})`);
      expect(blocks.map((b) => b.type)).toEqual(["PARAGRAPH"]);
      expect(serialized(blocks)).toContain("Diagram");
      expect(serialized(blocks)).not.toMatch(/"kind":"IMAGE"/);
      expect(serialized(blocks)).not.toMatch(/\\"url\\":/);
      expect(unsafeNotes(notes)).toBe(1);
    }
  );

  it.each(BAD)(
    "a file, video or pdf tag with src %s becomes text",
    async (url) => {
      const { blocks, notes } = await convert(
        [
          `<file src="${url}">Spec</file>`,
          `<video src="${url}">Demo</video>`,
          `<pdf src="${url}">Paper</pdf>`,
        ].join("\n\n")
      );
      expect(blocks.map((b) => b.type)).toEqual([
        "PARAGRAPH",
        "PARAGRAPH",
        "PARAGRAPH",
      ]);
      expect(serialized(blocks)).not.toMatch(/"kind":"FILE"/);
      expect(unsafeNotes(notes)).toBe(3);
    }
  );

  it.each(BAD)(
    "a page tag for an unimported page at %s becomes text",
    async (url) => {
      const { blocks, notes } = await convert(
        `<page url="${url}">Other page</page>`
      );
      expect(serialized(blocks)).not.toMatch(/"kind":"LINK"/);
      expect(serialized(blocks)).toContain("Other page");
      expect(unsafeNotes(notes)).toBe(1);
    }
  );

  it.each(BAD)(
    "a bookmark or link the importer resolved to %s becomes text",
    async (url) => {
      const md = '<unknown url="https://www.notion.so/p#1" alt="bookmark"/>';
      for (const kind of ["bookmark", "link"] as const) {
        const { blocks, notes } = await convert(md, () => ({
          kind,
          url,
          title: "Article",
        }));
        expect(serialized(blocks)).not.toMatch(/"kind":"(BOOKMARK|LINK)"/);
        expect(serialized(blocks)).toContain("Article");
        expect(unsafeNotes(notes)).toBe(1);
      }
      const { blocks, notes } = await convert(md, () => ({
        kind: "text",
        text: url,
      }));
      expect(blocks.map((b) => b.type)).toEqual(["PARAGRAPH"]);
      expect(unsafeNotes(notes)).toBe(1);
    }
  );

  it("keeps safe bookmarks, files and images", async () => {
    const { blocks, notes } = await convert(
      [
        "![Pic](https://images.example.com/a.png)",
        '<file src="https://files.example.com/a.pdf">Doc</file>',
        '<unknown url="https://www.notion.so/p#1" alt="bookmark"/>',
      ].join("\n\n"),
      () => ({ kind: "bookmark", url: "https://example.com/x", title: "X" })
    );
    expect(blocks.map((b) => b.type)).toEqual(["IMAGE", "FILE", "BOOKMARK"]);
    expect(unsafeNotes(notes)).toBe(0);
  });
});

/* ---------- through the whole importer ---------- */

const PAGE_ID = "11111111-1111-4111-8111-111111111111";
const BOOKMARK_BLOCK = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const allowAll: ImportLimitGuard = {
  allowCreate: async () => ({ allowed: true }),
};

function sourceWith(options: {
  cover: NotionPage["cover"];
  markdown: string;
  blocks?: Record<string, NotionBlock>;
}): NotionSource {
  const page: NotionPage = {
    object: "page",
    id: PAGE_ID,
    last_edited_time: "2026-10-01T10:00:00.000Z",
    parent: { type: "workspace", workspace: true },
    properties: {
      title: { id: "title", type: "title", title: [{ plain_text: "Page" }] },
    },
    cover: options.cover,
  };
  const list = (results: unknown[]) => ({
    object: "list" as const,
    results,
    has_more: false,
    next_cursor: null,
  });
  return {
    search: async (kind) => list(kind === "page" ? [page] : []),
    queryDataSource: async () => list([]),
    getPageMarkdown: async (): Promise<NotionMarkdown> => ({
      markdown: options.markdown,
    }),
    getBlock: async (id) => {
      const found = options.blocks?.[id];
      if (!found) throw new Error("no block");
      return found;
    },
  };
}

describe("the Notion import refuses unsafe addresses", () => {
  it.each(BAD)("drops a cover and a bookmark that point at %s", async (url) => {
    const db = createMemoryDb();
    const { warnings } = await runNotionImport({
      source: sourceWith({
        cover: { type: "external", external: { url } },
        markdown: `<unknown url="https://www.notion.so/p#${BOOKMARK_BLOCK.replace(/-/g, "")}" alt="bookmark"/>\n\n[a link](${url})\n\n![img](${url})`,
        blocks: {
          [BOOKMARK_BLOCK]: {
            id: BOOKMARK_BLOCK,
            type: "bookmark",
            bookmark: { url },
          },
        },
      }),
      store: db.notionStoreFor("ws-1"),
      guard: allowAll,
      download: jest.fn(),
    });

    const page = [...db.pages.values()][0];
    expect(page.coverUrl).toBeNull();
    const stored = JSON.stringify(page.blocks);
    // The address may survive as visible text, never as a link or a source.
    expect(stored).not.toMatch(/\\?"(url|href|src)\\?"/);
    expect(stored).not.toMatch(/"kind":"(BOOKMARK|LINK|IMAGE)"/);
    expect(stored).not.toContain('"type":"link"');
    const note = warnings.find((w) => w.code === "link_unsafe");
    expect(note?.message).toContain("plain text");
  });

  it("keeps a safe cover and bookmark", async () => {
    const db = createMemoryDb();
    await runNotionImport({
      source: sourceWith({
        cover: {
          type: "external",
          external: { url: "https://images.example.com/c.jpg" },
        },
        markdown: `<unknown url="https://www.notion.so/p#${BOOKMARK_BLOCK.replace(/-/g, "")}" alt="bookmark"/>`,
        blocks: {
          [BOOKMARK_BLOCK]: {
            id: BOOKMARK_BLOCK,
            type: "bookmark",
            bookmark: { url: "https://example.com/article" },
          },
        },
      }),
      store: db.notionStoreFor("ws-1"),
      guard: allowAll,
      download: jest.fn(),
    });
    const page = [...db.pages.values()][0];
    expect(page.coverUrl).toBe("https://images.example.com/c.jpg");
    expect(JSON.stringify(page.blocks)).toContain(
      "https://example.com/article"
    );
  });
});
