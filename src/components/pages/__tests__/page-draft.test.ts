import type { JSONContent } from "@tiptap/core";

import {
  decidePageDraft,
  parsePageDraft,
  serializePageDraft,
} from "@/components/pages/page-draft";

const doc = (text: string): JSONContent => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

describe("page recovery draft", () => {
  it("round-trips the document with its base revision", () => {
    const draft = parsePageDraft(serializePageDraft(doc("mine"), 4));
    expect(draft).toEqual({ document: doc("mine"), baseRevision: 4 });
  });

  it("reads the old bare-document format as a draft of unknown base", () => {
    expect(parsePageDraft(JSON.stringify(doc("old")))).toEqual({
      document: doc("old"),
      baseRevision: null,
    });
  });

  it("rejects text that is not a draft", () => {
    expect(parsePageDraft("not json")).toBeNull();
    expect(parsePageDraft("42")).toBeNull();
    expect(parsePageDraft(JSON.stringify({ v: 1 }))).toBeNull();
  });

  it("applies a draft written against the revision now on the server", () => {
    const draft = { document: doc("mine"), baseRevision: 4 };
    expect(
      decidePageDraft({
        draft,
        serverRevision: 4,
        serverDocument: doc("server"),
      })
    ).toBe("apply");
  });

  it("does not apply a stale draft over edits made on another device", () => {
    const draft = { document: doc("mine"), baseRevision: 4 };
    expect(
      decidePageDraft({
        draft,
        serverRevision: 7,
        serverDocument: doc("other device"),
      })
    ).toBe("stale");
  });

  it("treats a draft of unknown base as stale", () => {
    expect(
      decidePageDraft({
        draft: { document: doc("old"), baseRevision: null },
        serverRevision: 7,
      })
    ).toBe("stale");
  });

  it("discards a draft identical to the server content", () => {
    expect(
      decidePageDraft({
        draft: { document: doc("same"), baseRevision: 2 },
        serverRevision: 9,
        serverDocument: doc("same"),
      })
    ).toBe("discard");
  });
});
