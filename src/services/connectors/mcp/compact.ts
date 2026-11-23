/**
 * Compact tool answers: the rows `needt_get`, `needt_list` and `needt_search`
 * return are raw database rows (a task is ~105 columns, ~70 of them null or
 * empty), which costs an agent thousands of tokens per call. The compact pass
 * leaves out what carries no information:
 *
 * - keys whose value is null, undefined, an empty string, an empty array or an
 *   empty object (a missing field means "not set");
 * - for tasks, internal sync and estimate columns an agent never acts on.
 *
 * It never drops `false` or `0` (done: false, pinned: false and a position of 0
 * mean something), never touches the envelope of a list (`nextCursor: null`
 * says "no more pages"), and never looks inside opaque JSON a person wrote
 * (page block content, property values), where an empty string is content.
 * `verbose: true` on the tool skips the pass and returns the full row.
 */

/**
 * Kept even when null or empty, so every item stays self-describing and a
 * client that checks `=== null` (a task with no start, no project) keeps
 * working.
 */
const ALWAYS_KEEP: ReadonlySet<string> = new Set([
  "id",
  "title",
  "name",
  "status",
  "done",
  "position",
  "kind",
  "type",
  "scheduledStart",
  "scheduledEnd",
  "dueDate",
  "completedAt",
  "projectId",
  "parentId",
]);

/**
 * Person-written or free-form JSON: copied as it is, never pruned. Only a
 * null or missing value is left out; `{}` and "" are content (an empty page
 * block, an empty custom field).
 */
const OPAQUE: ReadonlySet<string> = new Set([
  "content",
  "value",
  "style",
  "config",
  "options",
  "properties",
  "attendees",
  "organizer",
]);

/** Booleans that are noise when false, and information when true. */
const DROP_WHEN_FALSE: ReadonlySet<string> = new Set(["isSample"]);

/**
 * Task columns that are scheduler, estimate or sync bookkeeping: no tool
 * reads them back, and an agent cannot act on them.
 */
export const INTERNAL_TASK_KEYS: ReadonlySet<string> = new Set([
  "estOptimistic",
  "estLikely",
  "estPessimistic",
  "estimateDelta",
  "optimisticDelta",
  "likelyDelta",
  "pessimisticDelta",
  "scheduleScore",
  "blockEventId",
  "blockFeedId",
  "blockDirty",
  "externalTaskId",
  "externalListId",
  "externalCreatedAt",
  "externalUpdatedAt",
  "syncStatus",
  "syncError",
  "syncHash",
  "skipSync",
  "lastSyncedAt",
  "boardPosition",
  "ideaCheckedAt",
  "ideaLastShownAt",
  "ideaSkipCount",
  "simplifiedAt",
]);

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as object).length === 0)
  );
}

/** Dates, Decimals and the like serialize themselves; resolve that first. */
function plain(value: unknown): unknown {
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { toJSON?: unknown }).toJSON === "function"
  ) {
    return (value as { toJSON: () => unknown }).toJSON();
  }
  return value;
}

export function compact(input: unknown, drop?: ReadonlySet<string>): unknown {
  const value = plain(input);
  if (Array.isArray(value)) {
    return value.map((item) => compact(item, drop));
  }
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (drop?.has(key)) continue;
    if (child === undefined) continue;
    if (DROP_WHEN_FALSE.has(key) && child === false) continue;
    if (OPAQUE.has(key)) {
      if (child !== null) out[key] = plain(child);
      continue;
    }
    const resolved = compact(child, drop);
    if (!ALWAYS_KEEP.has(key) && isEmpty(resolved)) continue;
    out[key] = resolved;
  }
  return out;
}

/** One row (`needt_get`), or the rows of a list page (`needt_list`). */
export function compactRow(row: unknown, drop?: ReadonlySet<string>): unknown {
  return compact(row, drop);
}

/**
 * A list page `{ items, nextCursor, note? }`: the items are compacted, the
 * envelope is left alone.
 */
export function compactPage<T extends { items: unknown[] }>(
  result: T,
  drop?: ReadonlySet<string>
): T {
  return { ...result, items: result.items.map((item) => compact(item, drop)) };
}
