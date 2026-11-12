/**
 * A live table as an .xlsx workbook: one sheet named after the table, a bold
 * filled header row that stays frozen, column widths from the content, text
 * wrapped, dropdown columns carried over as Excel list validation, numbers,
 * dates and yes/no as real cell types, and links as hyperlinks.
 */
import ExcelJS from "exceljs";

import { newDate } from "@/lib/date-utils";

import {
  type LiveTableColumn,
  type LiveTableView,
  cellText,
} from "@/lib/live-tables/schema";

/** Excel's own limits on sheet names: 31 characters, none of []:*?/\ */
export function sheetName(title: string): string {
  const cleaned = title.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31);
  return cleaned || "Table";
}

/** Inline list validation is capped by Excel at 255 characters. */
const INLINE_LIST_LIMIT = 250;

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function widthFor(column: LiveTableColumn, table: LiveTableView): number {
  const longest = table.rows.reduce(
    (max, row) => Math.max(max, cellText(column, row.cells[column.id]).length),
    column.name.length
  );
  const options = (column.options ?? []).reduce(
    (max, option) => Math.max(max, option.length),
    0
  );
  return Math.min(60, Math.max(10, longest + 2, options + 4));
}

export async function liveTableWorkbook(
  table: LiveTableView
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Needt";
  const sheet = workbook.addWorksheet(sheetName(table.title), {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = table.columns.map((column) => ({
    header: column.name,
    key: column.id,
    width: widthFor(column, table),
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle" };
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEFEFEF" },
    };
    cell.border = { bottom: { style: "thin", color: { argb: "FFBFBFBF" } } };
  });

  for (const row of table.rows) {
    const added = sheet.addRow({});
    table.columns.forEach((column, index) => {
      const value = row.cells[column.id];
      const cell = added.getCell(index + 1);
      if (value === null || value === undefined) return;
      switch (column.type) {
        case "number":
          cell.value = typeof value === "number" ? value : Number(value);
          break;
        case "checkbox":
          cell.value = Boolean(value);
          break;
        case "date": {
          const [y, m, d] = String(value).split("-").map(Number);
          cell.value = newDate(Date.UTC(y, m - 1, d));
          cell.numFmt = "yyyy-mm-dd";
          break;
        }
        case "url":
          cell.value = { text: String(value), hyperlink: String(value) };
          cell.font = { color: { argb: "FF0563C1" }, underline: true };
          break;
        default:
          cell.value = String(value);
      }
      cell.alignment = { vertical: "top", wrapText: column.type === "text" };
    });
  }

  // Dropdowns: validation on the data rows, room left for rows added in Excel.
  const lastRow = Math.max(table.rows.length + 1, 200);
  let lists: ExcelJS.Worksheet | null = null;
  table.columns.forEach((column, index) => {
    if (column.type !== "select" || !column.options?.length) return;
    let formula: string;
    const inline = column.options.join(",");
    if (inline.length <= INLINE_LIST_LIMIT && !/[",]/.test(column.options.join(""))) {
      formula = `"${inline}"`;
    } else {
      lists ??= workbook.addWorksheet("Lists", { state: "veryHidden" });
      const listColumn = columnLetter(index);
      column.options.forEach((option, optionIndex) => {
        lists!.getCell(`${listColumn}${optionIndex + 1}`).value = option;
      });
      formula = `Lists!$${listColumn}$1:$${listColumn}$${column.options.length}`;
    }
    // exceljs keeps validation per cell (its typings have no range API).
    for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
      sheet.getCell(rowNumber, index + 1).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [formula],
        showErrorMessage: true,
        errorTitle: column.name,
        error: "Pick one of the options in the list.",
      };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
