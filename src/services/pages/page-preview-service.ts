import { Prisma } from "@prisma/client";

import {
  type PagePreviewBlock,
  buildPagePreview,
} from "@/lib/pages/page-preview";
import { prisma } from "@/lib/prisma";

/** Top-level blocks read per page: the rows come from the first few. */
export const PREVIEW_BLOCKS_PER_PAGE = 12;
/**
 * A block whose stored JSON is longer than this is not read whole: only its
 * first text comes back. Keeps one huge table or code block from being
 * shipped to the server for a 120-character preview.
 */
export const PREVIEW_CONTENT_LIMIT = 8_192;

interface PreviewRow {
  pageId: string;
  id: string;
  type: string;
  position: number;
  content: unknown;
  firstText: string | null;
}

/**
 * The miniature previews of many pages in ONE query. The caller passes the
 * ids of pages it has already scoped to what the person may see (the list
 * route's own `findMany`); this function does no access check of its own and
 * must not be handed ids from anywhere else.
 *
 * Plan: `unnest(ids)` drives a LATERAL subquery per page that walks the
 * `(pageId, parentBlockId, position)` index in order and stops after
 * `PREVIEW_BLOCKS_PER_PAGE` rows, so a page of 2 000 blocks costs 12 index
 * entries, and nothing is sorted or windowed over the whole table. The
 * size test and the first-text extraction run on those few rows only.
 *
 * `ORDER BY "parentBlockId", "position"` (not just "position") is what lets
 * the planner use that index order: with `parentBlockId IS NULL` it is the
 * same order, but a bare `ORDER BY "position"` falls back to a bitmap scan
 * of every root block of the page plus a top-N sort (measured on 500 pages
 * of 300 blocks: 152 000 buffer hits and 175 ms, against 7 500 and 50 ms).
 */
export async function loadPagePreviews(
  pageIds: readonly string[]
): Promise<Map<string, PagePreviewBlock[]>> {
  const previews = new Map<string, PagePreviewBlock[]>();
  if (pageIds.length === 0) return previews;
  const rows = await prisma.$queryRaw<PreviewRow[]>(Prisma.sql`
    SELECT
      p."id" AS "pageId",
      b."id" AS "id",
      b."type"::text AS "type",
      b."position" AS "position",
      CASE WHEN length(b."content"::text) <= ${PREVIEW_CONTENT_LIMIT}
        THEN b."content" END AS "content",
      CASE WHEN length(b."content"::text) > ${PREVIEW_CONTENT_LIMIT}
        THEN left(
          jsonb_path_query_first(b."content", 'lax $.**.text') #>> '{}',
          400
        ) END AS "firstText"
    FROM unnest(${[...pageIds]}::text[]) AS p("id")
    CROSS JOIN LATERAL (
      SELECT x."id", x."type", x."position", x."content"
      FROM "PageBlock" x
      WHERE x."pageId" = p."id" AND x."parentBlockId" IS NULL
      ORDER BY x."parentBlockId" ASC, x."position" ASC
      LIMIT ${PREVIEW_BLOCKS_PER_PAGE}
    ) b
  `);
  const byPage = new Map<string, PreviewRow[]>();
  for (const row of rows) {
    const list = byPage.get(row.pageId);
    if (list) list.push(row);
    else byPage.set(row.pageId, [row]);
  }
  for (const id of pageIds) {
    const list = byPage.get(id) ?? [];
    list.sort(
      (a, b) =>
        a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
    previews.set(id, buildPagePreview(list));
  }
  return previews;
}
