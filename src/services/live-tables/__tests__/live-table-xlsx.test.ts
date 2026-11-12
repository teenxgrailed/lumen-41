import ExcelJS from "exceljs";

import type { LiveTableView } from "@/lib/live-tables/schema";

import { liveTableWorkbook, sheetName } from "../live-table-xlsx";

const table: LiveTableView = {
  id: "t1",
  pageId: "p1",
  title: "iPhone Vocal Mics",
  createdBy: "AI",
  createdAt: "2026-11-12T10:00:00.000Z",
  updatedAt: "2026-11-12T10:00:00.000Z",
  columns: [
    { id: "c1", name: "Model", type: "text" },
    { id: "c2", name: "Price", type: "number" },
    {
      id: "c3",
      name: "Status",
      type: "select",
      options: ["Брать", "Альтернатива", "Не брать"],
    },
    { id: "c4", name: "In stock", type: "checkbox" },
    { id: "c5", name: "Since", type: "date" },
    { id: "c6", name: "Link", type: "url" },
  ],
  rows: [
    {
      id: "r1",
      position: 1024,
      cells: {
        c1: "Shure MV88+",
        c2: 149,
        c3: "Брать",
        c4: true,
        c5: "2026-11-01",
        c6: "https://example.com/mv88",
      },
    },
    {
      id: "r2",
      position: 2048,
      cells: { c1: "Rode", c2: null, c3: null, c4: false, c5: null, c6: null },
    },
  ],
};

async function read(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

describe("liveTableWorkbook", () => {
  it("writes a frozen bold header and typed cells", async () => {
    const workbook = await read(await liveTableWorkbook(table));
    const sheet = workbook.getWorksheet("iPhone Vocal Mics")!;
    expect(sheet).toBeDefined();
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet.getRow(1).values).toEqual([
      undefined,
      "Model",
      "Price",
      "Status",
      "In stock",
      "Since",
      "Link",
    ]);
    expect(sheet.getCell("A1").font?.bold).toBe(true);
    expect(sheet.getCell("B2").value).toBe(149);
    expect(sheet.getCell("C2").value).toBe("Брать");
    expect(sheet.getCell("D2").value).toBe(true);
    expect(sheet.getCell("E2").value).toEqual(new Date(Date.UTC(2026, 10, 1)));
    expect(sheet.getCell("F2").value).toMatchObject({
      hyperlink: "https://example.com/mv88",
    });
    expect(sheet.getCell("B3").value).toBeNull();
    expect(sheet.actualRowCount).toBe(3);
  });

  it("keeps the dropdown as list validation", async () => {
    const workbook = await read(await liveTableWorkbook(table));
    const sheet = workbook.getWorksheet("iPhone Vocal Mics")!;
    expect(sheet.getCell("C2").dataValidation).toMatchObject({
      type: "list",
      formulae: ['"Брать,Альтернатива,Не брать"'],
    });
    expect(sheet.getCell("C150").dataValidation?.type).toBe("list");
    expect(sheet.getCell("B2").dataValidation).toBeUndefined();
  });

  it("moves long or comma-holding option lists to a hidden sheet", async () => {
    const workbook = await read(
      await liveTableWorkbook({
        ...table,
        columns: [
          { id: "c1", name: "Pick", type: "select", options: ["a, b", "c"] },
        ],
        rows: [],
      })
    );
    const lists = workbook.getWorksheet("Lists")!;
    expect(lists.state).toBe("veryHidden");
    expect(lists.getCell("A1").value).toBe("a, b");
    expect(
      workbook.getWorksheet(sheetName(table.title))!.getCell("A2")
        .dataValidation?.formulae
    ).toEqual(["Lists!$A$1:$A$2"]);
  });

  it("names the sheet within Excel's rules", () => {
    expect(sheetName("Q1/Q2: [plan]?")).toBe("Q1 Q2   plan");
    expect(sheetName("x".repeat(40))).toHaveLength(31);
    expect(sheetName("  ")).toBe("Table");
  });
});
