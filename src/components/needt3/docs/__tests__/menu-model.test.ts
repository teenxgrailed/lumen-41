import {
  DOC_ACTION_WORDS,
  docActions,
  exportHref,
  renameValue,
} from "../menu-model";

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("docActions", () => {
  it("phone: the full set in order, no new tab", () => {
    expect(ids(docActions({ isFavorite: false }, { phone: true }))).toEqual([
      "open",
      "rename",
      "move",
      "pin",
      "duplicate",
      "share",
      "copy-link",
      "trash",
    ]);
  });

  it("desktop: the same set plus Open in New Tab", () => {
    const rows = docActions({ isFavorite: false }, { phone: false });
    expect(ids(rows)).toEqual([
      "open",
      "open-new-tab",
      "rename",
      "move",
      "pin",
      "duplicate",
      "share",
      "copy-link",
      "trash",
    ]);
  });

  it("Pin is Unpin on a pinned doc", () => {
    const pin = (isFavorite: boolean) =>
      docActions({ isFavorite }, { phone: true }).find((r) => r.id === "pin")!;
    expect(pin(false).label).toBe(DOC_ACTION_WORDS.pin);
    expect(pin(true).label).toBe(DOC_ACTION_WORDS.unpin);
  });

  it("Move to Trash is the last row, alone in its group, and dangerous", () => {
    const rows = docActions({ isFavorite: false }, { phone: true });
    const last = rows[rows.length - 1];
    expect(last).toMatchObject({ id: "trash", danger: true });
    expect(rows.filter((r) => r.group === last.group)).toHaveLength(1);
  });

  it("Export rows appear only where the build has the route", () => {
    const withExport = docActions(
      { isFavorite: false },
      { phone: true, canExport: true }
    );
    expect(ids(withExport)).toEqual(
      expect.arrayContaining(["export-md", "export-pdf"])
    );
    expect(
      ids(docActions({ isFavorite: false }, { phone: true }))
    ).not.toContain("export-md");
  });

  it("groups never go backwards (the desktop splits on them)", () => {
    const groups = docActions({ isFavorite: false }, { phone: false }).map(
      (r) => r.group
    );
    expect([...groups].sort()).toEqual(groups);
  });
});

describe("renameValue", () => {
  it("trims, clips to 240 and refuses empty or unchanged names", () => {
    expect(renameValue("Old", "  New ")).toBe("New");
    expect(renameValue("Old", "   ")).toBeNull();
    expect(renameValue("Old", " Old ")).toBeNull();
    expect(renameValue(null, "A")).toBe("A");
    expect(renameValue("x", "y".repeat(300))).toHaveLength(240);
  });
});

describe("exportHref", () => {
  it("points at the Markdown route with the id encoded", () => {
    expect(exportHref("a/b")).toBe("/api/pages/a%2Fb/export?format=md");
  });
});
