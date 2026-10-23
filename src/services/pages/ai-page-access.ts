import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * The AI trust boundary for Pages. A page is "in a private tree" when it or
 * any ancestor has Private switched on. The in-app Pages screen refuses to
 * send such a page to an AI provider, and the assistant's page tools, the MCP
 * server and the learning pass hold the same line through this one module:
 * they neither read nor write a page in a private tree, even their owner's.
 * Human access through the app is not affected.
 */

type PageClient = Pick<Prisma.TransactionClient, "page">;

/** Ancestor hops followed before giving up; a deeper tree is not a real tree. */
const MAX_ANCESTOR_DEPTH = 64;

/** What the model or the connected tool is told about a page it cannot reach. */
export const AI_PAGE_UNAVAILABLE =
  "Page not found, or it is private. Private pages are never available to AI.";
export const AI_PAGE_NOT_EDITABLE =
  "Page not found, you cannot edit it, or it is private. Private pages are never available to AI.";

/**
 * Which of `pageIds` sit in a private tree. Ancestors are read level by level
 * (one query per level), without any workspace filter on purpose: a private
 * ancestor the caller cannot see still makes the whole branch private.
 */
export async function privateTreePageIds(
  pageIds: readonly string[],
  client: PageClient = prisma
): Promise<Set<string>> {
  const wanted = [...new Set(pageIds)];
  const blocked = new Set<string>();
  if (!wanted.length) return blocked;

  const nodes = new Map<
    string,
    { parentId: string | null; isPrivate: boolean }
  >();
  let frontier = wanted;
  for (
    let depth = 0;
    frontier.length > 0 && depth <= MAX_ANCESTOR_DEPTH;
    depth += 1
  ) {
    const rows = await client.page.findMany({
      where: { id: { in: frontier } },
      select: { id: true, parentId: true, isPrivate: true },
    });
    const next = new Set<string>();
    for (const row of rows) {
      nodes.set(row.id, { parentId: row.parentId, isPrivate: row.isPrivate });
    }
    for (const row of rows) {
      if (row.parentId && !nodes.has(row.parentId)) next.add(row.parentId);
    }
    frontier = [...next];
  }

  for (const id of wanted) {
    const visited = new Set<string>();
    let cursor: string | null = id;
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      const node = nodes.get(cursor);
      if (!node) break;
      if (node.isPrivate) {
        blocked.add(id);
        break;
      }
      cursor = node.parentId;
    }
  }
  return blocked;
}

export async function isPageInPrivateTree(
  pageId: string,
  client: PageClient = prisma
) {
  return (await privateTreePageIds([pageId], client)).has(pageId);
}

/** `pages` without the ones in a private tree, in the same order. */
export async function withoutPrivateTrees<T extends { id: string }>(
  pages: readonly T[],
  client: PageClient = prisma
): Promise<T[]> {
  if (!pages.length) return [];
  const blocked = await privateTreePageIds(
    pages.map((page) => page.id),
    client
  );
  return pages.filter((page) => !blocked.has(page.id));
}
