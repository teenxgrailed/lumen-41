import {
  LiveTableInputError,
  buildColumns,
  cellText,
  normalizeCell,
  normalizeRow,
  parseStoredCells,
  parseStoredColumns,
} from "../schema";

const columns = buildColumns([
  { name: "Model", type: "text" },
  { name: "Price", type: "number" },
  {
    name: "Status",
    type: "select",
    options: ["Брать", "Альтернатива", "Не брать"],
  },
  { name: "In stock", type: "checkbox" },
  { name: "Since", type: "date" },
  { name: "Link", type: "url" },
]);
const [model, price, status, stock, since, link] = columns;

describe("buildColumns", () => {
  it("gives short ids in order and keeps dropdown options", () => {
    expect(columns.map((c) => c.id)).toEqual([
      "c1",
      "c2",
      "c3",
      "c4",
      "c5",
      "c6",
    ]);
    expect(status.options).toEqual(["Брать", "Альтернатива", "Не брать"]);
    expect(model).not.toHaveProperty("options");
  });

  it("defaults the type to text", () => {
    expect(buildColumns([{ name: "Notes" }])[0].type).toBe("text");
  });

  it("refuses a dropdown without options, duplicate names and no columns", () => {
    expect(() => buildColumns([{ name: "S", type: "select" }])).toThrow(
      LiveTableInputError
    );
    expect(() => buildColumns([{ name: "A" }, { name: "a" }])).toThrow(
      /given twice/
    );
    expect(() => buildColumns([])).toThrow(/at least one column/);
  });
});

describe("normalizeCell", () => {
  it("stores empty input as null in every type", () => {
    for (const column of columns) {
      expect(normalizeCell(column, "")).toBeNull();
      expect(normalizeCell(column, null)).toBeNull();
    }
  });

  it("reads numbers from text, with comma decimals and thousands marks", () => {
    expect(normalizeCell(price, "1'299,50")).toBe(1299.5);
    expect(normalizeCell(price, 42)).toBe(42);
    expect(normalizeCell(price, "1,234")).toBe(1234);
    expect(normalizeCell(price, "1,234.50")).toBe(1234.5);
    expect(normalizeCell(price, "1.234,50")).toBe(1234.5);
    expect(normalizeCell(price, "1,5")).toBe(1.5);
    expect(() => normalizeCell(price, "cheap")).toThrow(/not a number/);
  });

  it("matches dropdown options case-insensitively, in the option's spelling", () => {
    expect(normalizeCell(status, "брать")).toBe("Брать");
    expect(() => normalizeCell(status, "Maybe")).toThrow(/one of the options/);
  });

  it("checks dates, links and yes/no", () => {
    expect(normalizeCell(since, "2026-11-12")).toBe("2026-11-12");
    expect(() => normalizeCell(since, "2026-02-30")).toThrow(/real date/);
    expect(() => normalizeCell(since, "12.11.2026")).toThrow(/YYYY-MM-DD/);
    expect(normalizeCell(link, "https://example.com/a")).toBe(
      "https://example.com/a"
    );
    expect(() => normalizeCell(link, "javascript:alert(1)")).toThrow(
      /web address/
    );
    expect(normalizeCell(stock, "yes")).toBe(true);
    expect(normalizeCell(stock, false)).toBe(false);
  });
});

describe("normalizeRow", () => {
  it("takes a list in column order, missing tail cells empty", () => {
    expect(normalizeRow(columns, ["Shure MV88+", 149, "Брать"])).toEqual({
      c1: "Shure MV88+",
      c2: 149,
      c3: "Брать",
      c4: null,
      c5: null,
      c6: null,
    });
  });

  it("takes an object keyed by column name or id", () => {
    expect(
      normalizeRow(columns, {
        model: "Rode VideoMic",
        c2: "99",
        Status: "Не брать",
      })
    ).toMatchObject({ c1: "Rode VideoMic", c2: 99, c3: "Не брать" });
  });

  it("refuses unknown columns and too many values", () => {
    expect(() => normalizeRow(columns, { Colour: "red" })).toThrow(
      /no column "Colour"/
    );
    expect(() => normalizeRow(columns, [1, 2, 3, 4, 5, 6, 7])).toThrow(
      /7 values/
    );
  });
});

describe("stored values", () => {
  it("reads columns and cells back defensively", () => {
    const parsed = parseStoredColumns([
      { id: "c1", name: "A", type: "weird" },
      { id: "c2", name: "B", type: "select", options: ["x", 3] },
      "junk",
    ]);
    expect(parsed).toEqual([
      { id: "c1", name: "A", type: "text" },
      { id: "c2", name: "B", type: "select", options: ["x"] },
    ]);
    expect(
      parseStoredCells(parsed, { c1: "a", c2: { bad: 1 }, c9: "x" })
    ).toEqual({
      c1: "a",
      c2: null,
    });
  });

  it("shows yes/no for checkboxes and nothing for empty cells", () => {
    expect(cellText(stock, true)).toBe("Yes");
    expect(cellText(stock, false)).toBe("No");
    expect(cellText(model, null)).toBe("");
  });
});
