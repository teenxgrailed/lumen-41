/**
 * Pages saved before Callout, Toggle and Columns were real blocks hold them as
 * `needtPageBlock` atoms: `{ kind: "CALLOUT", data: '{"text":"…"}' }`. Those
 * atoms could not be edited. They are read as the real nodes instead:
 *
 *   CALLOUT  -> needtCallout  (the text becomes its first paragraph)
 *   TOGGLE   -> needtToggle   (the text becomes the title)
 *   COLUMNS  -> needtColumns  (two empty columns, three when the label says so)
 *
 * Pure and shared by the browser, the collaboration document and the API, so
 * every reader of a stored page sees the same shape. Saving writes the new
 * shape; nothing in the database is rewritten ahead of that.
 */
import type { JSONContent } from "@tiptap/core";

export const LEGACY_UPGRADED_KINDS = ["CALLOUT", "TOGGLE", "COLUMNS"] as const;

function legacyData(node: JSONContent): Record<string, unknown> {
  const raw = node.attrs?.data;
  if (typeof raw !== "string" || raw.length > 20_000) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function paragraphOf(text: string): JSONContent {
  return text
    ? { type: "paragraph", content: [{ type: "text", text }] }
    : { type: "paragraph" };
}

function pickText(data: Record<string, unknown>) {
  for (const key of ["text", "title", "name"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

export function isLegacySpecialBlock(node: JSONContent) {
  return (
    node.type === "needtPageBlock" &&
    LEGACY_UPGRADED_KINDS.includes(
      node.attrs?.kind as (typeof LEGACY_UPGRADED_KINDS)[number]
    )
  );
}

/** One node: the legacy atom as its real block; anything else unchanged. */
export function upgradeLegacyNode(node: JSONContent): JSONContent {
  if (!isLegacySpecialBlock(node)) return node;
  const blockId =
    typeof node.attrs?.blockId === "string" ? node.attrs.blockId : null;
  const data = legacyData(node);
  const text = pickText(data);
  switch (node.attrs?.kind) {
    case "CALLOUT":
      return {
        type: "needtCallout",
        attrs: { blockId, icon: "💡", color: "default" },
        content: [paragraphOf(text)],
      };
    case "TOGGLE":
      return {
        type: "needtToggle",
        attrs: { blockId },
        content: [paragraphOf(text)],
      };
    default: {
      const count = /three|3/i.test(String(data.title ?? "")) ? 3 : 2;
      return {
        type: "needtColumns",
        attrs: { blockId },
        content: Array.from({ length: count }, () => ({
          type: "needtColumn",
          attrs: { width: Math.round(10000 / count) / 100 },
          content: [{ type: "paragraph" }],
        })),
      };
    }
  }
}

/** A document with every top-level legacy atom upgraded. Same object when none. */
export function upgradeLegacyDocument(document: JSONContent): JSONContent {
  if (!document.content?.some(isLegacySpecialBlock)) return document;
  return {
    ...document,
    content: document.content.map(upgradeLegacyNode),
  };
}
