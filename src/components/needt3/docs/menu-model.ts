/**
 * The actions of a document's row/card menu, decided once for both faces: the
 * phone's long-press sheet and the desktop's right-click menu draw the same
 * rows in the same order with the same words. Pure, so it is tested without a
 * DOM. The faces own the icons and how an action is carried out.
 *
 * Pin and Star are one field (`isFavorite`): the star on a card is the pin.
 */
import type { V3Doc } from "@/lib/needt3/map";

export type DocActionId =
  | "open"
  | "open-new-tab"
  | "rename"
  | "move"
  | "pin"
  | "duplicate"
  | "share"
  | "copy-link"
  | "export-md"
  | "export-pdf"
  | "trash";

export interface DocActionSpec {
  id: DocActionId;
  label: string;
  /** Rows of the same group sit together; a hairline (desktop) separates groups. */
  group: number;
  danger?: boolean;
}

export interface DocMenuOptions {
  /** The phone has no new tab; the desktop has no use for a bare "Open" on a card tap, but keeps it. */
  phone: boolean;
  /** Whether `GET /api/pages/:id/export` exists on this build. */
  canExport?: boolean;
}

export const DOC_ACTION_WORDS = {
  open: "Open",
  openNewTab: "Open in New Tab",
  rename: "Rename",
  move: "Move to project",
  pin: "Pin",
  unpin: "Unpin",
  duplicate: "Duplicate",
  share: "Share…",
  copyLink: "Copy link",
  exportMd: "Export as Markdown",
  exportPdf: "Export as PDF",
  trash: "Move to Trash",
} as const;

export function docActions(
  doc: Pick<V3Doc, "isFavorite">,
  { phone, canExport = false }: DocMenuOptions
): DocActionSpec[] {
  const w = DOC_ACTION_WORDS;
  const rows: DocActionSpec[] = [
    { id: "open", label: w.open, group: 0 },
    ...(phone
      ? []
      : [{ id: "open-new-tab", label: w.openNewTab, group: 0 } as const]),
    { id: "rename", label: w.rename, group: 1 },
    { id: "move", label: w.move, group: 1 },
    { id: "pin", label: doc.isFavorite ? w.unpin : w.pin, group: 1 },
    { id: "duplicate", label: w.duplicate, group: 1 },
    { id: "share", label: w.share, group: 2 },
    { id: "copy-link", label: w.copyLink, group: 2 },
  ];
  if (canExport) {
    rows.push(
      { id: "export-md", label: w.exportMd, group: 2 },
      { id: "export-pdf", label: w.exportPdf, group: 2 }
    );
  }
  rows.push({ id: "trash", label: w.trash, group: 3, danger: true });
  return rows;
}

/** A rename's value: trimmed; an empty or unchanged name is not a change. */
export function renameValue(
  current: string | null | undefined,
  typed: string
): string | null {
  const next = typed.trim().slice(0, 240);
  if (!next) return null;
  return next === (current ?? "").trim() ? null : next;
}

/** The Markdown export route for a page (`GET /api/pages/:id/export`). */
export function exportHref(id: string) {
  return `/api/pages/${encodeURIComponent(id)}/export?format=md`;
}
