import type {
  NotionBlock,
  NotionDataSource,
  NotionList,
  NotionMarkdown,
  NotionPage,
  NotionSource,
} from "../../../notion/types";
import {
  NOTION_PAGE_URL,
  calloutMd,
  mediaMd,
  mentionsMd,
  referencesMd,
  tableMd,
  unknownMd,
} from "./markdown";

/** A small shared Notion workspace, in the shapes the 2026-03-11 API returns. */

export const ID = {
  projects: "11111111-1111-4111-8111-111111111111",
  roadmap: "22222222-2222-4222-8222-222222222222",
  orphan: "33333333-3333-4333-8333-333333333333",
  columnPage: "44444444-4444-4444-8444-444444444444",
  trashed: "55555555-5555-4555-8555-555555555555",
  database: "66666666-6666-4666-8666-666666666666",
  databaseParent: "77777777-7777-4777-8777-777777777777",
  rowA: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  rowB: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  columnBlock: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  bookmarkBlock: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  embedBlock: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  unsharedParent: "99999999-9999-4999-8999-999999999999",
};

export const SIGNED_IMAGE =
  "https://prod-files-secure.s3.us-west-2.amazonaws.com/ws/img/diagram.png?X-Amz-Signature=abc&X-Amz-Expires=3600";
export const SIGNED_FILE =
  "https://prod-files-secure.s3.us-west-2.amazonaws.com/ws/file/spec%20sheet.pdf?X-Amz-Signature=def&X-Amz-Expires=3600";

const title = (text: string) => [{ plain_text: text }];

function page(
  id: string,
  name: string,
  parent: NotionPage["parent"],
  extra: Partial<NotionPage> = {}
): NotionPage {
  return {
    object: "page",
    id,
    last_edited_time: "2026-10-01T10:00:00.000Z",
    in_trash: false,
    url: NOTION_PAGE_URL(id),
    parent,
    properties: { title: { id: "title", type: "title", title: title(name) } },
    icon: null,
    cover: null,
    ...extra,
  };
}

export const projectsPage = page(
  ID.projects,
  "Projects",
  { type: "workspace", workspace: true },
  {
    icon: { type: "emoji", emoji: "🚀" },
    cover: {
      type: "external",
      external: { url: "https://images.example.com/cover.jpg" },
    },
  }
);
export const roadmapPage = page(ID.roadmap, "Roadmap", {
  type: "page_id",
  page_id: ID.projects,
});
export const orphanPage = page(ID.orphan, "Orphan", {
  type: "page_id",
  page_id: ID.unsharedParent,
});
export const columnPage = page(ID.columnPage, "Inside a column", {
  type: "block_id",
  block_id: ID.columnBlock,
});
export const trashedPage = page(
  ID.trashed,
  "Trashed",
  { type: "page_id", page_id: ID.projects },
  { in_trash: true }
);

export const dataSource: NotionDataSource = {
  object: "data_source",
  id: ID.database,
  title: title("Tasks DB"),
  last_edited_time: "2026-10-01T10:00:00.000Z",
  parent: { type: "database_id", database_id: ID.databaseParent },
  database_parent: { type: "page_id", page_id: ID.projects },
  icon: { type: "emoji", emoji: "✅" },
  properties: {
    Name: { id: "title", name: "Name", type: "title" },
    Notes: { id: "a", name: "Notes", type: "rich_text" },
    Qty: { id: "b", name: "Qty", type: "number" },
    Kind: {
      id: "c",
      name: "Kind",
      type: "select",
      select: { options: [{ name: "Bug" }, { name: "Chore" }] },
    },
    Tags: {
      id: "d",
      name: "Tags",
      type: "multi_select",
      multi_select: { options: [{ name: "x" }, { name: "y" }] },
    },
    State: {
      id: "e",
      name: "State",
      type: "status",
      status: { options: [{ name: "Todo" }, { name: "Done" }] },
    },
    Due: { id: "f", name: "Due", type: "date" },
    Done: { id: "g", name: "Done", type: "checkbox" },
    Link: { id: "h", name: "Link", type: "url" },
    Mail: { id: "i", name: "Mail", type: "email" },
    Phone: { id: "j", name: "Phone", type: "phone_number" },
    Owner: { id: "k", name: "Owner", type: "people" },
    Parent: { id: "l", name: "Parent", type: "relation" },
    Total: { id: "m", name: "Total", type: "rollup" },
    Score: { id: "n", name: "Score", type: "formula" },
    Attachments: { id: "o", name: "Attachments", type: "files" },
    Created: { id: "p", name: "Created", type: "created_time" },
    Edited: { id: "q", name: "Edited", type: "last_edited_time" },
    Author: { id: "r", name: "Author", type: "created_by" },
    Editor: { id: "s", name: "Editor", type: "last_edited_by" },
    ID: { id: "t", name: "ID", type: "unique_id" },
    Go: { id: "u", name: "Go", type: "button" },
  },
};

const rowParent = {
  type: "data_source_id",
  data_source_id: ID.database,
  database_id: ID.databaseParent,
};

export const rowA: NotionPage = page(ID.rowA, "Fix login", rowParent, {
  properties: {
    Name: { id: "title", type: "title", title: title("Fix login") },
    Notes: {
      id: "a",
      type: "rich_text",
      rich_text: title("Users cannot sign in"),
    },
    Qty: { id: "b", type: "number", number: 3 },
    Kind: { id: "c", type: "select", select: { name: "Bug" } },
    Tags: {
      id: "d",
      type: "multi_select",
      multi_select: [{ name: "x" }, { name: "y" }],
    },
    State: { id: "e", type: "status", status: { name: "Done" } },
    Due: {
      id: "f",
      type: "date",
      date: { start: "2026-10-20", end: "2026-10-22" },
    },
    Done: { id: "g", type: "checkbox", checkbox: true },
    Link: { id: "h", type: "url", url: "https://example.com/issue" },
    Mail: { id: "i", type: "email", email: "ada@example.com" },
    Phone: { id: "j", type: "phone_number", phone_number: "+1 555 0100" },
    Owner: {
      id: "k",
      type: "people",
      people: [
        { id: "u1", name: "Ada" },
        { id: "u2", name: "Grace" },
      ],
    },
    Parent: {
      id: "l",
      type: "relation",
      relation: [{ id: ID.roadmap }, { id: ID.unsharedParent }],
    },
    Total: {
      id: "m",
      type: "rollup",
      rollup: {
        type: "array",
        array: [
          { type: "number", number: 2 },
          { type: "number", number: 5 },
        ],
      },
    },
    Score: {
      id: "n",
      type: "formula",
      formula: { type: "number", number: 42 },
    },
    Attachments: {
      id: "o",
      type: "files",
      files: [
        { name: "log.txt", type: "file", file: { url: SIGNED_FILE } },
        {
          name: "ext.png",
          type: "external",
          external: { url: "https://images.example.com/e.png" },
        },
      ],
    },
    Created: {
      id: "p",
      type: "created_time",
      created_time: "2026-09-01T08:00:00.000Z",
    },
    Edited: {
      id: "q",
      type: "last_edited_time",
      last_edited_time: "2026-10-01T10:00:00.000Z",
    },
    Author: {
      id: "r",
      type: "created_by",
      created_by: { id: "u1", name: "Ada" },
    },
    Editor: {
      id: "s",
      type: "last_edited_by",
      last_edited_by: { id: "u2", name: "Grace" },
    },
    ID: {
      id: "t",
      type: "unique_id",
      unique_id: { prefix: "TASK", number: 7 },
    },
    Go: { id: "u", type: "button", button: {} },
  },
});
export const rowB: NotionPage = page(ID.rowB, "Write docs", rowParent, {
  properties: {
    Name: { id: "title", type: "title", title: title("Write docs") },
    Done: { id: "g", type: "checkbox", checkbox: false },
  },
});

/** The body (markdown) of every page and row. */
export function bodies(): Record<string, NotionMarkdown> {
  return {
    [ID.projects]: {
      markdown: referencesMd(
        NOTION_PAGE_URL(ID.roadmap),
        NOTION_PAGE_URL(ID.databaseParent)
      ),
      truncated: false,
      unknown_block_ids: [],
    },
    [ID.roadmap]: {
      markdown: [
        calloutMd,
        tableMd,
        mediaMd(SIGNED_IMAGE, SIGNED_FILE),
        unknownMd(ID.bookmarkBlock, ID.embedBlock),
      ].join("\n"),
      truncated: false,
      unknown_block_ids: [],
    },
    [ID.orphan]: {
      markdown: mentionsMd.replace("PAGE_B_URL", NOTION_PAGE_URL(ID.roadmap)),
      truncated: true,
      unknown_block_ids: [ID.columnBlock],
    },
    [ID.columnPage]: {
      markdown: "Body in a column.",
      truncated: false,
      unknown_block_ids: [],
    },
    [ID.rowA]: {
      markdown: "Steps to reproduce.",
      truncated: false,
      unknown_block_ids: [],
    },
    [ID.rowB]: { markdown: "", truncated: false, unknown_block_ids: [] },
  };
}

export interface FakeWorld {
  pages: NotionPage[];
  dataSources: NotionDataSource[];
  rows: NotionPage[];
  markdown: Record<string, NotionMarkdown>;
  blocks: Record<string, NotionBlock>;
}

export function world(): FakeWorld {
  return {
    // Rows also come back from search, as in the real API.
    pages: [
      projectsPage,
      roadmapPage,
      orphanPage,
      columnPage,
      trashedPage,
      rowA,
      rowB,
    ],
    dataSources: [dataSource],
    rows: [rowA, rowB],
    markdown: bodies(),
    blocks: {
      [ID.columnBlock]: {
        id: ID.columnBlock,
        type: "column",
        parent: { type: "block_id", block_id: ID.bookmarkBlock },
      },
      [ID.bookmarkBlock]: {
        id: ID.bookmarkBlock,
        type: "bookmark",
        parent: { type: "page_id", page_id: ID.projects },
        bookmark: { url: "https://example.com/article" },
      },
      [ID.embedBlock]: {
        id: ID.embedBlock,
        type: "embed",
        parent: { type: "page_id", page_id: ID.roadmap },
        embed: { url: "https://example.com/embed" },
      },
    },
  };
}

function paged(
  items: unknown[],
  cursor: string | undefined,
  size = 2
): NotionList {
  const start = cursor ? Number(cursor) : 0;
  const next = start + size;
  return {
    object: "list",
    results: items.slice(start, next),
    has_more: next < items.length,
    next_cursor: next < items.length ? String(next) : null,
  };
}

/** A NotionSource over a world, paging two results at a time. */
export function fakeNotion(w: FakeWorld = world()): NotionSource & {
  calls: { markdown: string[]; blocks: string[]; search: number };
} {
  const calls = { markdown: [] as string[], blocks: [] as string[], search: 0 };
  return {
    calls,
    async search(kind, cursor) {
      calls.search += 1;
      return paged(kind === "page" ? w.pages : w.dataSources, cursor);
    },
    async queryDataSource(_id, cursor) {
      return paged(w.rows, cursor);
    },
    async getPageMarkdown(id) {
      calls.markdown.push(id);
      const found = w.markdown[id];
      if (!found) throw new Error(`no markdown for ${id}`);
      return found;
    },
    async getBlock(id) {
      calls.blocks.push(id);
      const found = w.blocks[id];
      if (!found) throw new Error(`no block ${id}`);
      return found;
    },
  };
}
