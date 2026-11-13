/**
 * Live tables: a table stored beside the page document (not inside it), shown
 * on the page by a `needtLiveTable` block. Rows are appended to their own
 * rows, so Claude can keep writing while the person has the page open and
 * watches the rows arrive; the document itself is only written once, when the
 * block is placed.
 *
 * Access follows the page: reading needs the page, writing needs edit rights
 * on it (and an AI actor never reaches a page in a private tree).
 */
import {
  type PageActor,
  pageActorCanAccess,
} from "@/services/pages/page-model";
import { appendPageBlocks, createPage } from "@/services/pages/page-service";
import { writePageBlocks } from "@/services/pages/page-write-path";
import {
  type LiveTable,
  type LiveTableRow,
  PageAccessRole,
  PageAuthor,
  PageBlockType,
  Prisma,
} from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import {
  LIVE_TABLE_MAX_ROWS,
  LIVE_TABLE_MAX_ROWS_PER_APPEND,
  type LiveTableCell,
  type LiveTableColumnInput,
  LiveTableInputError,
  type LiveTableRowInput,
  type LiveTableView,
  buildColumns,
  normalizeCell,
  normalizeRow,
  parseStoredCells,
  parseStoredColumns,
} from "@/lib/live-tables/schema";
import { prisma } from "@/lib/prisma";
import { randomId } from "@/lib/uuid";

export class LiveTableNotFoundError extends Error {
  constructor() {
    super("Table not found");
  }
}

export class LiveTablePageNotEditableError extends Error {
  constructor() {
    super("The page cannot be edited");
  }
}

const ROW_STEP = 1024;

type TableWithRows = LiveTable & { rows: LiveTableRow[] };

export function liveTableView(table: TableWithRows): LiveTableView {
  const columns = parseStoredColumns(table.columns);
  return {
    id: table.id,
    pageId: table.pageId,
    title: table.title,
    columns,
    rows: table.rows
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((row) => ({
        id: row.id,
        position: row.position,
        cells: parseStoredCells(columns, row.cells),
      })),
    createdBy: table.createdBy,
    createdAt: table.createdAt.toISOString(),
    updatedAt: table.updatedAt.toISOString(),
  };
}

/** The page node that shows a table; also used for the block's stored JSON. */
export function liveTableNode(tableId: string, title: string, blockId: string) {
  return {
    type: "needtLiveTable",
    attrs: { blockId, tableId, title },
  };
}

async function loadTable(
  actor: PageActor,
  tableId: string,
  role: PageAccessRole
): Promise<TableWithRows> {
  const table = await prisma.liveTable.findUnique({
    where: { id: tableId },
    include: { rows: true },
  });
  if (!table) throw new LiveTableNotFoundError();
  // A table on a page the caller cannot see does not exist for them.
  const access = await pageActorCanAccess(actor, table.pageId, role);
  if (!access) {
    if (
      role !== PageAccessRole.VIEWER &&
      (await pageActorCanAccess(actor, table.pageId, PageAccessRole.VIEWER))
    ) {
      throw new LiveTablePageNotEditableError();
    }
    throw new LiveTableNotFoundError();
  }
  return table;
}

export async function getLiveTable(actor: PageActor, tableId: string) {
  return liveTableView(await loadTable(actor, tableId, PageAccessRole.VIEWER));
}

/** Tables shown on a page, for readers that list them (MCP page reads). */
export async function listPageLiveTables(actor: PageActor, pageId: string) {
  if (!(await pageActorCanAccess(actor, pageId, PageAccessRole.VIEWER))) {
    return [];
  }
  const tables = await prisma.liveTable.findMany({
    where: { pageId },
    orderBy: { createdAt: "asc" },
    include: { rows: true },
  });
  return tables.map(liveTableView);
}

function rowsData(
  tableId: string,
  columns: ReturnType<typeof parseStoredColumns>,
  rows: LiveTableRowInput[],
  after: number
) {
  return rows.map((row, index) => ({
    tableId,
    position: after + (index + 1) * ROW_STEP,
    cells: normalizeRow(columns, row) as Prisma.InputJsonObject,
  }));
}

export interface CreateLiveTableInput {
  /** Place the table at the end of this page; without it a new page is made. */
  pageId?: string | null;
  /** Title of the new page when no pageId is given (defaults to the table title). */
  pageTitle?: string | null;
  parentId?: string | null;
  title: string;
  columns: LiveTableColumnInput[];
  rows?: LiveTableRowInput[];
  createdBy?: PageAuthor;
}

/**
 * Creates the table and places its block on the page. When the block cannot
 * be written (the page is open for live editing, or changed underneath) the
 * table is removed again, so a failed call leaves nothing behind.
 */
export async function createLiveTable(
  actor: PageActor,
  input: CreateLiveTableInput
) {
  const columns = buildColumns(input.columns);
  const rows = input.rows ?? [];
  if (rows.length > LIVE_TABLE_MAX_ROWS_PER_APPEND) {
    throw new LiveTableInputError(
      `Add at most ${LIVE_TABLE_MAX_ROWS_PER_APPEND} rows at a time`
    );
  }
  // Validate every row before anything is written.
  rows.forEach((row) => normalizeRow(columns, row));
  const createdBy = input.createdBy ?? PageAuthor.HUMAN;
  const title = input.title.trim().slice(0, 240) || "Table";

  let pageId = input.pageId ?? null;
  let createdPage: Awaited<ReturnType<typeof createPage>> | null = null;
  if (pageId) {
    if (!(await pageActorCanAccess(actor, pageId, PageAccessRole.EDITOR))) {
      throw new LiveTablePageNotEditableError();
    }
  } else {
    createdPage = await createPage(actor, {
      title: input.pageTitle?.trim() || title,
      parentId: input.parentId ?? null,
      createdBy,
    });
    pageId = createdPage.id;
  }

  const table = await prisma.liveTable.create({
    data: {
      pageId,
      title,
      columns: columns as unknown as Prisma.InputJsonArray,
      createdBy,
    },
  });
  if (rows.length > 0) {
    await prisma.liveTableRow.createMany({
      data: rowsData(table.id, columns, rows, 0),
    });
  }

  const blockId = randomId();
  const block = {
    id: blockId,
    type: PageBlockType.LIVE_TABLE,
    content: { json: liveTableNode(table.id, title, blockId) },
    position: ROW_STEP,
    createdBy,
  };
  try {
    const written = createdPage
      ? await writePageBlocks(
          actor,
          createdPage.id,
          [block],
          createdBy,
          createdPage.documentFormatVersion === 2 ? 2 : 1,
          createdPage.contentRevision
        )
      : await appendPageBlocks(actor, pageId, [block], createdBy);
    if (!written) throw new LiveTablePageNotEditableError();
  } catch (error) {
    await prisma.liveTable.delete({ where: { id: table.id } }).catch(() => {});
    if (createdPage) {
      await prisma.page
        .delete({ where: { id: createdPage.id } })
        .catch(() => {});
    }
    throw error;
  }
  return getLiveTable(actor, table.id);
}

export async function appendLiveTableRows(
  actor: PageActor,
  tableId: string,
  rows: LiveTableRowInput[]
) {
  if (rows.length === 0) throw new LiveTableInputError("No rows to add");
  if (rows.length > LIVE_TABLE_MAX_ROWS_PER_APPEND) {
    throw new LiveTableInputError(
      `Add at most ${LIVE_TABLE_MAX_ROWS_PER_APPEND} rows at a time`
    );
  }
  const table = await loadTable(actor, tableId, PageAccessRole.EDITOR);
  if (table.rows.length + rows.length > LIVE_TABLE_MAX_ROWS) {
    throw new LiveTableInputError(
      `A table has at most ${LIVE_TABLE_MAX_ROWS} rows`
    );
  }
  const columns = parseStoredColumns(table.columns);
  const last = table.rows.reduce((max, row) => Math.max(max, row.position), 0);
  const data = rowsData(table.id, columns, rows, last);
  await prisma.$transaction([
    prisma.liveTableRow.createMany({ data }),
    // Touch the table so readers polling `updatedAt` see the change.
    prisma.liveTable.update({
      where: { id: table.id },
      data: { updatedAt: newDate() },
    }),
  ]);
  return getLiveTable(actor, table.id);
}

/** Set some cells of one row; cells not named are kept. */
export async function updateLiveTableRow(
  actor: PageActor,
  tableId: string,
  rowId: string,
  cells: Record<string, LiveTableCell>
) {
  const table = await loadTable(actor, tableId, PageAccessRole.EDITOR);
  const row = table.rows.find((candidate) => candidate.id === rowId);
  if (!row) throw new LiveTableNotFoundError();
  const columns = parseStoredColumns(table.columns);
  const next = parseStoredCells(columns, row.cells);
  for (const [key, value] of Object.entries(cells)) {
    const column =
      columns.find((candidate) => candidate.id === key) ??
      columns.find(
        (candidate) => candidate.name.toLowerCase() === key.toLowerCase()
      );
    if (!column) throw new LiveTableInputError(`There is no column "${key}"`);
    next[column.id] = normalizeCell(column, value);
  }
  await prisma.$transaction([
    prisma.liveTableRow.update({
      where: { id: row.id },
      data: { cells: next as Prisma.InputJsonObject },
    }),
    prisma.liveTable.update({
      where: { id: table.id },
      data: { updatedAt: newDate() },
    }),
  ]);
  return getLiveTable(actor, table.id);
}

export async function deleteLiveTableRow(
  actor: PageActor,
  tableId: string,
  rowId: string
) {
  const table = await loadTable(actor, tableId, PageAccessRole.EDITOR);
  if (!table.rows.some((row) => row.id === rowId)) {
    throw new LiveTableNotFoundError();
  }
  await prisma.$transaction([
    prisma.liveTableRow.delete({ where: { id: rowId } }),
    prisma.liveTable.update({
      where: { id: table.id },
      data: { updatedAt: newDate() },
    }),
  ]);
  return getLiveTable(actor, table.id);
}
