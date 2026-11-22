import { type Page, expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { mkdirSync, readFileSync } from "node:fs";

import { type V3User, createV3User, signInAs } from "./helpers/v3-user";

/*
 * Live tables against the real API and database: a table is created through
 * the API (the same service the MCP tool calls), the page opens on its header,
 * rows written while the page is open arrive one by one, a dropdown cell is
 * changed in place, and the table downloads as an .xlsx with the dropdown
 * kept as list validation.
 *
 * Screenshots land in docs/live-tables/ when LIVE_TABLES_SHOTS=1.
 */

const SHOTS = process.env.LIVE_TABLES_SHOTS === "1";
const SHOT_DIR = "docs/live-tables";

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await page
    .locator("[data-needt-live-table]")
    .first()
    .screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

const ROWS: Array<[string, number, string, string]> = [
  ["Shure MV88+", 149, "Брать", "Lightning/USB-C, stereo"],
  ["Rode VideoMic Me-C+", 99, "Альтернатива", "Light, on-camera"],
  ["Zoom iQ7", 119, "Не брать", "Lightning only"],
  ["Sennheiser MKE 200", 109, "Альтернатива", "Needs adapter"],
  ["DJI Mic 2", 349, "Брать", "Wireless, two TX"],
  ["Saramonic Blink 500", 129, "Не брать", "Noisy preamp"],
];

async function api(
  page: Page,
  user: V3User,
  method: "POST" | "GET",
  path: string,
  data?: unknown
) {
  const response = await page.request.fetch(path, {
    method,
    data,
    headers: { "x-workspace-id": user.workspaceId },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("Live tables: header first, rows arrive while open, dropdown edits, .xlsx export", async ({
  page,
}) => {
  // `next dev` compiles each route on its first hit; allow for it.
  test.setTimeout(600_000);
  const user = await createV3User("live-tables");
  await signInAs(page, user);
  await page.goto("/pages", { timeout: 300_000 });

  const { table } = await api(page, user, "POST", "/api/live-tables", {
    title: "iPhone Vocal Mics",
    columns: [
      { name: "Model", type: "text" },
      { name: "Price", type: "number" },
      {
        name: "Status",
        type: "select",
        options: ["Брать", "Альтернатива", "Не брать"],
      },
      { name: "Notes", type: "text" },
    ],
  });

  await page.goto(`/pages/${table.pageId}`, { timeout: 300_000 });
  const block = page.locator(`[data-needt-live-table="${table.id}"]`).first();
  await expect(block.getByRole("columnheader", { name: "Status" })).toBeVisible(
    { timeout: 120_000 }
  );
  await expect(block.locator("tbody tr")).toHaveCount(0);
  await expect(block.locator("thead tr")).toHaveAttribute("data-arriving", "");
  await shot(page, "01-header");

  // Rows written one at a time while the page is open, the way Claude does.
  for (const [index, row] of ROWS.entries()) {
    await api(page, user, "POST", `/api/live-tables/${table.id}/rows`, {
      rows: [row],
    });
    const rows = block.locator("tbody tr");
    await expect(rows).toHaveCount(index + 1, { timeout: 10_000 });
    await expect(rows.nth(index)).toHaveAttribute("data-arriving", "");
    if (index === 2) await shot(page, "02-building");
  }
  await expect(
    block.locator("tbody tr").nth(4).locator("input").first()
  ).toHaveValue("DJI Mic 2");
  await page.waitForTimeout(600);
  await shot(page, "03-built");

  // The dropdown cell is a picker with the column's options.
  const statusCell = block.locator("tbody tr").nth(1).locator("td").nth(2);
  await statusCell
    .getByRole("button")
    .or(statusCell.getByRole("combobox"))
    .first()
    .click();
  await page.getByRole("option", { name: "Брать", exact: true }).click();
  await expect
    .poll(async () => {
      const read = await api(page, user, "GET", `/api/live-tables/${table.id}`);
      return read.table.rows[1].cells.c3;
    })
    .toBe("Брать");

  // A bad dropdown value is refused by the API with the options named.
  const refused = await page.request.post(`/api/live-tables/${table.id}/rows`, {
    data: { rows: [["X", 1, "Maybe"]] },
    headers: { "x-workspace-id": user.workspaceId },
  });
  expect(refused.status()).toBe(400);
  expect((await refused.json()).error).toContain("one of the options");

  // Export downloads an .xlsx that keeps header, types and the dropdown.
  const downloadPromise = page.waitForEvent("download");
  await block.getByRole("button", { name: "Export .xlsx" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("iPhone-Vocal-Mics.xlsx");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    readFileSync((await download.path())!) as unknown as ArrayBuffer
  );
  const sheet = workbook.getWorksheet("iPhone Vocal Mics")!;
  expect(sheet.getCell("A1").value).toBe("Model");
  expect(sheet.getCell("A2").value).toBe("Shure MV88+");
  expect(sheet.getCell("B2").value).toBe(149);
  expect(sheet.getCell("C3").value).toBe("Брать");
  expect(sheet.getCell("C2").dataValidation?.type).toBe("list");
  expect(sheet.actualRowCount).toBe(ROWS.length + 1);

  // Opened again later, an old table shows at once without motion.
  await page.reload();
  await expect(block.locator("tbody tr")).toHaveCount(ROWS.length);
});
