/**
 * The page a task came from, as one plain field.
 *
 * A task made from a document keeps `originKind = "doc"` and `originId = <page
 * id>` (the columns the origin chip reads). The task API shows that as
 * `originPageId` and takes it on write, so a client that wires Needt to
 * another tool needs no knowledge of the two columns. Additive: the columns
 * are unchanged and still accepted.
 *
 * Pure; the routes call these around Prisma.
 */

export const DOC_ORIGIN = "doc";

interface OriginColumns {
  originKind?: string | null;
  originId?: string | null;
}

/** The page id a task came from, or null (a mail or chat origin is not a page). */
export function originPageIdOf(task: OriginColumns): string | null {
  return task.originKind === DOC_ORIGIN && task.originId ? task.originId : null;
}

/** The task with `originPageId` added; everything else is passed through. */
export function withOriginPageId<T extends OriginColumns>(
  task: T
): T & { originPageId: string | null } {
  return { ...task, originPageId: originPageIdOf(task) };
}

/**
 * Turn a body's `originPageId` into the columns Prisma stores, and remove it
 * (it is not a column). A page id sets `doc` + the id; `null` clears both
 * columns. When the body also names `originKind` / `originId`, those win: they
 * are the more specific write.
 */
export function expandOriginPage<T extends Record<string, unknown>>(
  data: T
): Omit<T, "originPageId"> {
  const { originPageId, ...rest } = data as T & {
    originPageId?: string | null;
  };
  if (originPageId === undefined) return rest;
  const out: Record<string, unknown> = { ...rest };
  if (!("originKind" in out)) {
    out.originKind = originPageId ? DOC_ORIGIN : null;
  }
  if (!("originId" in out)) out.originId = originPageId ? originPageId : null;
  return out as Omit<T, "originPageId">;
}
