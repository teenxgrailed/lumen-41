/**
 * Duplicate a document with the plain page API: read the page, create a new
 * one, write the blocks. Pure, so the rules are tested without a network:
 * the copy's title, and what a block keeps when it is copied.
 *
 * A block copied from another page must not carry that page's identity:
 *  - the block id is dropped (the server mints one);
 *  - `attrs.blockId` inside the stored node is dropped (the editor sets it);
 *  - a task item keeps its text and tick but loses `taskId`: the copy is a
 *    plain checklist line, not a second handle on the original's Task.
 */

const TITLE_MAX = 240;
const COPY_PREFIX = "Copy of ";

export interface SourceBlock {
  id?: string;
  type: string;
  content: unknown;
  position?: number;
  parentBlockId?: string | null;
}

export interface CopiedBlock {
  type: string;
  content: unknown;
  position: number;
}

/** "Copy of X", clipped to the title limit; an empty title copies as Untitled. */
export function copyTitle(title: string | null | undefined): string {
  const base = (title ?? "").trim() || "Untitled";
  return (COPY_PREFIX + base).slice(0, TITLE_MAX);
}

/** Attributes that tie a stored node to the page or the task it came from. */
const IDENTITY_ATTRS = ["blockId", "taskId", "taskDue"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A deep copy of a stored node without its identity attributes. */
export function stripNodeIdentity(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripNodeIdentity);
  if (!isRecord(node)) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "attrs" && isRecord(value)) {
      const attrs: Record<string, unknown> = { ...value };
      for (const name of IDENTITY_ATTRS) delete attrs[name];
      out.attrs = attrs;
    } else {
      out[key] = stripNodeIdentity(value);
    }
  }
  return out;
}

/** The blocks of the copy: top-level only, in reading order, fresh positions. */
export function duplicateBlocks(blocks: readonly SourceBlock[]): CopiedBlock[] {
  const copied = blocks
    .filter((b) => !b.parentBlockId)
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((b, index) => ({
      type: b.type,
      content: stripNodeIdentity(b.content),
      position: (index + 1) * 1024,
    }));
  // A page always has a line to type on.
  return copied.length
    ? copied
    : [{ type: "PARAGRAPH", content: { text: "" }, position: 1024 }];
}
