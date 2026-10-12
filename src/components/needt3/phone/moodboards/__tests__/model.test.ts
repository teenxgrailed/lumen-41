import { FREE_BOARDS } from "../../../places/derive";
import {
  BOARDS_PAYWALL_FEATURE,
  type PhoneBoardItem,
  SWATCHES,
  addDraft,
  blankAdd,
  boardCountLine,
  boardMeta,
  boardQuota,
  checkAdd,
  itemName,
  madeLine,
  nameOk,
  parseLink,
  pickedColour,
  referenceCount,
  renameChanges,
  searchBoards,
  searchItems,
  typedHex,
  wallColumns,
} from "../model";

const item = (p: Partial<PhoneBoardItem> & { id: string }): PhoneBoardItem => ({
  kind: "image",
  url: null,
  color: null,
  text: null,
  title: null,
  ratio: 1,
  colorName: null,
  source: null,
  thumbnailUrl: null,
  position: 0,
  createdAt: null,
  ...p,
});

describe("wallColumns", () => {
  it("puts each reference into the shorter column, in order", () => {
    const items = [
      item({ id: "a", ratio: 1.5 }),
      item({ id: "b", ratio: 0.5 }),
      item({ id: "c", ratio: 0.5 }),
      item({ id: "d", ratio: 1 }),
    ];
    const [left, right] = wallColumns(items);
    // a (1.5) left; b (0.5) right; c -> right still shorter; d -> right (1.0 < 1.5)
    expect(left.map((x) => x.id)).toEqual(["a"]);
    expect(right.map((x) => x.id)).toEqual(["b", "c", "d"]);
  });
  it("keeps every item exactly once", () => {
    const items = Array.from({ length: 11 }, (_, i) =>
      item({
        id: String(i),
        kind: i % 2 ? "note" : "color",
        text: "x".repeat(i * 9),
      })
    );
    const [l, r] = wallColumns(items);
    expect([...l, ...r].map((x) => x.id).sort()).toEqual(
      items.map((x) => x.id).sort()
    );
  });
  it("an empty board is two empty columns", () => {
    expect(wallColumns([])).toEqual([[], []]);
  });
});

describe("itemName", () => {
  it("prefers title, then colour name, then words, then the kind", () => {
    expect(itemName(item({ id: "1", title: "Chair" }))).toBe("Chair");
    expect(itemName(item({ id: "1", kind: "color", colorName: "Rust" }))).toBe(
      "Rust"
    );
    expect(itemName(item({ id: "1", kind: "note", text: "Buy paint" }))).toBe(
      "Buy paint"
    );
    expect(itemName(item({ id: "1", kind: "link" }))).toBe("Link");
  });
});

describe("the Free allowance", () => {
  it("is FREE_BOARDS and shows the count", () => {
    const q = boardQuota("free", 0);
    expect(q.max).toBe(FREE_BOARDS);
    expect(q.text).toBe(`0 of ${FREE_BOARDS} boards`);
    expect(q.atLimit).toBe(false);
  });
  it("blocks a new board at the limit", () => {
    const q = boardQuota("free", FREE_BOARDS);
    expect(q.atLimit).toBe(true);
    expect(q.full).toBe(true);
  });
  it("gates nothing off Free or while the plan loads", () => {
    for (const kind of ["monthly", "trial", "lifetime", undefined])
      expect(boardQuota(kind, 9)).toMatchObject({ max: null, atLimit: false });
  });
  it("names the number once, in the paywall line", () => {
    expect(BOARDS_PAYWALL_FEATURE).toContain(String(FREE_BOARDS));
  });
});

describe("lines", () => {
  it("dates a board on the person's clock", () => {
    expect(madeLine("2026-10-09T23:30:00Z", "UTC")).toBe("Made 9 Oct");
    expect(madeLine("2026-10-09T23:30:00Z", "Pacific/Auckland")).toBe(
      "Made 10 Oct"
    );
    expect(madeLine(null, "UTC")).toBe("");
  });
  it("says Pinterest for a linked board, else when it was made", () => {
    expect(
      boardMeta({ createdAt: null, pinterestBoardId: "Rooms" }, "UTC")
    ).toBe("Pinterest board");
    expect(
      boardMeta(
        { createdAt: "2026-10-09T10:00:00Z", pinterestBoardId: null },
        "UTC"
      )
    ).toBe("Made 9 Oct");
    expect(boardMeta({ createdAt: null, pinterestBoardId: null }, "UTC")).toBe(
      "Moodboard"
    );
  });
  it("counts boards", () => {
    expect(boardCountLine(1)).toBe("1 board");
    expect(boardCountLine(0)).toBe("0 boards");
  });
});

describe("naming", () => {
  it("needs words", () => {
    expect(nameOk("  ")).toBe(false);
    expect(nameOk("Rooms")).toBe(true);
  });
  it("a rename to the same words or to nothing writes nothing", () => {
    expect(renameChanges({ value: " Rooms ", was: "Rooms" })).toBe(false);
    expect(renameChanges({ value: " ", was: "Rooms" })).toBe(false);
    expect(renameChanges({ value: "Kitchen", was: "Rooms" })).toBe(true);
  });
  it("searches boards by name", () => {
    const list = [{ title: "Rooms" }, { title: "Kitchen" }];
    expect(searchBoards(list, "room")).toEqual([{ title: "Rooms" }]);
    expect(searchBoards(list, "")).toEqual([]);
  });
});

describe("adding a reference", () => {
  const ask = (p: object) => ({ ...blankAdd("b1"), ...p });

  it("reads a pasted address like the prototype", () => {
    expect(parseLink("")).toBeNull();
    expect(parseLink("localhost")).toBeNull();
    expect(parseLink("www.are.na/block/1987")).toEqual({
      url: "https://www.are.na/block/1987",
      domain: "are.na",
      name: "Are.na",
      title: "Are.na",
    });
    expect(parseLink("https://ssense.com/en-us/women/oak-chair")).toMatchObject(
      {
        name: "SSENSE",
        title: "Oak chair",
      }
    );
  });

  it("a link needs a domain; the error shows only for typed text", () => {
    expect(checkAdd(ask({ step: "link", link: "" }))).toEqual({
      ok: false,
      error: null,
    });
    expect(checkAdd(ask({ step: "link", link: "nope" })).error).toMatch(
      /domain/
    );
    expect(checkAdd(ask({ step: "link", link: "are.na" })).ok).toBe(true);
  });

  it("a typed hex wins over the swatch, a bad one does not", () => {
    expect(typedHex("c2410c")).toBe("#C2410C");
    expect(typedHex("#c2410")).toBeNull();
    expect(pickedColour({ swatch: 3, hex: "" })).toEqual({
      color: SWATCHES[3][0],
      name: SWATCHES[3][1],
      typed: false,
    });
    expect(pickedColour({ swatch: 3, hex: "#fff000" })).toEqual({
      color: "#FFF000",
      name: "Custom",
      typed: true,
    });
    expect(pickedColour({ swatch: 3, hex: "zz" }).typed).toBe(false);
  });

  it("makes the drafts the route accepts", () => {
    expect(addDraft(ask({ step: "pick" }))).toBeNull();
    expect(addDraft(ask({ step: "note", note: "  " }))).toBeNull();
    expect(addDraft(ask({ step: "note", note: " Oak " }))).toEqual({
      kind: "note",
      text: "Oak",
      ratio: 0.7,
    });
    expect(addDraft(ask({ step: "color", swatch: 0 }))).toEqual({
      kind: "color",
      color: "#16161A",
      colorName: "Ink",
      ratio: 0.8,
    });
    expect(addDraft(ask({ step: "link", link: "are.na" }))?.kind).toBe("link");
  });

  it("every swatch is a hex the route accepts", () => {
    for (const [hex] of SWATCHES) expect(hex).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("searching a board", () => {
  const items = [
    item({ id: "a", title: "Oak chair" }),
    item({ id: "b", kind: "color", color: "#D7263D", colorName: "Signal red" }),
    item({
      id: "c",
      kind: "link",
      source: { name: "Are.na", domain: "are.na" },
    }),
  ];
  it("matches title, colour name, hex and site", () => {
    expect(searchItems(items, "oak").map((x) => x.id)).toEqual(["a"]);
    expect(searchItems(items, "signal").map((x) => x.id)).toEqual(["b"]);
    expect(searchItems(items, "d7263d").map((x) => x.id)).toEqual(["b"]);
    expect(searchItems(items, "are.na").map((x) => x.id)).toEqual(["c"]);
    expect(searchItems(items, " ")).toEqual([]);
  });
  it("counts references", () => {
    expect(referenceCount(1)).toBe("1 reference");
    expect(referenceCount(0)).toBe("0 references");
  });
});
