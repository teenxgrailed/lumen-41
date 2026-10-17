import { Editor } from "@tiptap/core";

import {
  IDENTITY_BLOCKS,
  ensureBlockIds,
} from "@/components/documents/BlockIdentity";
import {
  documentFromPageBlocks,
  pageBlocksFromDocument,
} from "@/components/pages/page-document";
import {
  blockIdFromHash,
  blockInsertRange,
  normalizeLinkInput,
  slashBefore,
} from "@/components/pages/page-editor-logic";
import {
  imageFilesFromTransfer,
  nameForPastedFile,
} from "@/components/pages/page-media";

import {
  pageEditorExtensions,
  pageEditorSchema,
} from "@/lib/pages/page-editor-schema";

describe("slashBefore", () => {
  it.each([
    ["/", ""],
    ["/he", "he"],
    ["hello /", ""],
    ["hello /head", "head"],
    ["a\tx /y", "y"],
    ["line one /h1", "h1"],
  ])("%j opens the menu with %j", (text, query) => {
    const hit = slashBefore(text);
    if (query === null) expect(hit).toBeNull();
    else expect(hit).toEqual({ query });
  });

  it.each(["and/or", "https://example.com", "a /b c", "no slash", "/a/b"])(
    "%j does not",
    (text) => {
      expect(slashBefore(text)).toBeNull();
    }
  );
});

describe("normalizeLinkInput", () => {
  it("adds https to a bare domain and mailto to an email", () => {
    expect(normalizeLinkInput(" example.com/a ")).toBe("https://example.com/a");
    expect(normalizeLinkInput("me@example.com")).toBe("mailto:me@example.com");
    expect(normalizeLinkInput("http://x.test")).toBe("http://x.test");
    expect(normalizeLinkInput("/pages/abc")).toBe("/pages/abc");
  });

  it("refuses what the shared allowlist refuses", () => {
    for (const bad of [
      "",
      "   ",
      "javascript:alert(1)",
      "data:text/html,x",
      "//evil.test",
      "has space.com",
      "/admin",
    ]) {
      expect(normalizeLinkInput(bad)).toBeNull();
    }
  });
});

describe("blockIdFromHash", () => {
  it("reads a block id and nothing else", () => {
    expect(blockIdFromHash("#abc-123_X")).toBe("abc-123_X");
    expect(blockIdFromHash("abc")).toBe("abc");
    expect(blockIdFromHash("")).toBeNull();
    expect(blockIdFromHash("#")).toBeNull();
    expect(blockIdFromHash("#a b")).toBeNull();
    expect(blockIdFromHash("#%E0%A4%A")).toBeNull();
    expect(blockIdFromHash(`#${"a".repeat(65)}`)).toBeNull();
  });
});

describe("blockInsertRange", () => {
  const doc = pageEditorSchema.nodeFromJSON({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "abc" }] },
      { type: "paragraph" },
      { type: "paragraph", content: [{ type: "text", text: "xyz" }] },
    ],
  });
  it("replaces an empty paragraph", () => {
    // paragraph 1 spans 0..5, the empty one 5..7
    expect(blockInsertRange(doc, 6)).toEqual({
      from: 5,
      to: 7,
      replace: true,
      atEnd: false,
    });
  });
  it("goes after a block with text, and says when that is the end", () => {
    expect(blockInsertRange(doc, 2)).toMatchObject({
      from: 5,
      to: 5,
      replace: false,
      atEnd: false,
    });
    expect(blockInsertRange(doc, 9)).toMatchObject({
      replace: false,
      atEnd: true,
    });
  });
  it("clamps a position past the end", () => {
    expect(blockInsertRange(doc, 9999).atEnd).toBe(true);
  });
});

describe("IDENTITY_BLOCKS", () => {
  it("names only nodes the schema has, and includes the table", () => {
    for (const name of IDENTITY_BLOCKS) {
      expect(pageEditorSchema.nodes[name]).toBeDefined();
    }
    expect(IDENTITY_BLOCKS).toContain("table");
    expect(IDENTITY_BLOCKS).not.toContain("taskReference");
    expect(IDENTITY_BLOCKS).not.toContain("taskGroupReference");
  });
});

describe("a table keeps its blockId across saves", () => {
  const table = {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableHeader",
            content: [{ type: "paragraph" }],
          },
          {
            type: "tableHeader",
            content: [{ type: "paragraph" }],
          },
        ],
      },
      {
        type: "tableRow",
        content: [
          { type: "tableCell", content: [{ type: "paragraph" }] },
          { type: "tableCell", content: [{ type: "paragraph" }] },
        ],
      },
    ],
  };

  it("is given an id once and serialises the same id every time", () => {
    const editor = new Editor({
      extensions: pageEditorExtensions,
      content: { type: "doc", content: [table, { type: "paragraph" }] },
    });
    ensureBlockIds(editor);
    const first = pageBlocksFromDocument(editor.getJSON());
    // The table is a block of its own with an id from the identity plugin.
    const node = editor.getJSON().content?.[0];
    expect(node?.type).toBe("table");
    expect(typeof node?.attrs?.blockId).toBe("string");
    expect(first[0].id).toBe(node?.attrs?.blockId);
    expect(first[0].type).toBe("TABLE");

    const second = pageBlocksFromDocument(editor.getJSON());
    const third = pageBlocksFromDocument(
      // What a reload sees: the stored blocks rebuilt into a document.
      documentFromPageBlocks(
        first.map((block) => ({
          ...block,
          pageId: "p",
          createdAt: "",
          updatedAt: "",
        })) as never
      )!
    );
    expect(second[0].id).toBe(first[0].id);
    expect(third[0].id).toBe(first[0].id);
    editor.destroy();
  });

  it("two tables get two different ids", () => {
    const editor = new Editor({
      extensions: pageEditorExtensions,
      content: { type: "doc", content: [table, table] },
    });
    ensureBlockIds(editor);
    const ids = editor.getJSON().content?.map((node) => node.attrs?.blockId);
    expect(new Set(ids).size).toBe(2);
    editor.destroy();
  });
});

describe("page blocks render their id", () => {
  it("a special block keeps data-block-id in HTML", () => {
    const toDOM = pageEditorSchema.nodes.needtPageBlock.spec.toDOM!;
    const node = pageEditorSchema.nodeFromJSON({
      type: "needtPageBlock",
      attrs: { blockId: "b1", kind: "CALLOUT", data: '{"text":"Hi"}' },
    });
    const spec = JSON.stringify(toDOM(node));
    expect(spec).toContain('"data-block-id":"b1"');
  });
});

describe("imageFilesFromTransfer", () => {
  const file = (name: string, type: string) => new File(["x"], name, { type });
  const transfer = (files: File[]) =>
    ({ files, items: [] }) as unknown as DataTransfer;

  it("keeps images and drops other files", () => {
    const picked = imageFilesFromTransfer(
      transfer([file("a.png", "image/png"), file("b.pdf", "application/pdf")])
    );
    expect(picked.map((f) => f.name)).toEqual(["a.png"]);
  });
  it("reads image items when there is no file list", () => {
    const img = file("c.jpg", "image/jpeg");
    const data = {
      files: [],
      items: [
        { kind: "string", type: "text/plain", getAsFile: () => null },
        { kind: "file", type: "image/jpeg", getAsFile: () => img },
      ],
    } as unknown as DataTransfer;
    expect(imageFilesFromTransfer(data)).toEqual([img]);
  });
  it("is empty for plain text and for nothing", () => {
    expect(imageFilesFromTransfer(transfer([]))).toEqual([]);
    expect(imageFilesFromTransfer(null)).toEqual([]);
  });
  it("names an anonymous screenshot", () => {
    const named = nameForPastedFile(file("image.png", "image/png"), 0);
    expect(named.name).toBe("pasted-image-1.png");
    expect(nameForPastedFile(file("photo.jpg", "image/jpeg"), 0).name).toBe(
      "photo.jpg"
    );
  });
});
