import type { JSONContent } from "@tiptap/core";

/**
 * The recovery draft kept in localStorage when a save cannot reach the server.
 * It carries the server revision it was written against, so a later visit can
 * tell "my unsaved edit on top of what is there" from "my unsaved edit on top
 * of something another device has since replaced". The first shape stored the
 * bare document with no revision; it is still read, as a draft of unknown base.
 */
export type PageDraft = {
  document: JSONContent;
  /** Null for a draft written before revisions were recorded. */
  baseRevision: number | null;
};

export type PageDraftDecision = "apply" | "discard" | "stale";

const DRAFT_VERSION = 1;

export function serializePageDraft(
  document: JSONContent,
  baseRevision: number | null
) {
  return JSON.stringify({ v: DRAFT_VERSION, baseRevision, document });
}

/** Null when the stored text is not a usable draft. */
export function parsePageDraft(raw: string): PageDraft | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.v === DRAFT_VERSION) {
    const document = record.document;
    if (!document || typeof document !== "object") return null;
    return {
      document: document as JSONContent,
      baseRevision:
        typeof record.baseRevision === "number" ? record.baseRevision : null,
    };
  }
  // Legacy: the bare document.
  if (typeof record.type === "string") {
    return { document: value as JSONContent, baseRevision: null };
  }
  return null;
}

/**
 * apply    the draft was written on top of the revision now on the server
 * discard  the draft says nothing the server does not already have
 * stale    the server has moved on (or the draft's base is unknown): keep the
 *          server's content and leave the draft for the person to restore
 */
export function decidePageDraft(input: {
  draft: PageDraft;
  serverRevision: number;
  serverDocument?: JSONContent | null;
}): PageDraftDecision {
  const { draft, serverRevision, serverDocument } = input;
  if (
    serverDocument &&
    JSON.stringify(serverDocument) === JSON.stringify(draft.document)
  ) {
    return "discard";
  }
  return draft.baseRevision === serverRevision ? "apply" : "stale";
}
