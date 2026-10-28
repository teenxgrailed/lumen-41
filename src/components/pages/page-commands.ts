/**
 * A block picked outside the editor (the v3 inspector's Insert tab) reaches
 * the open editor as this window event. `command` is one of the editor's own
 * command ids (`paragraph`, `heading1`, `CALLOUT`, `TABLE`, …); an id the editor
 * does not know is ignored, and a page the editor is not showing is ignored.
 */
export const PAGE_COMMAND_EVENT = "needt:page-command";

/** Every command id the editor knows (its "/" menu): the Insert tab may send these. */
export const PAGE_COMMAND_IDS = [
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "bullet",
  "ordered",
  "checklist",
  "taskItem",
  "quote",
  "code",
  "divider",
  "CALLOUT",
  "TOGGLE",
  "LINK",
  "BOOKMARK",
  "IMAGE",
  "FILE",
  "TABLE",
  "COLUMNS",
  "PAGE_MENTION",
  "TASK_REFERENCE",
  "PROJECT_REFERENCE",
  "DATE_MENTION",
  "FORM",
] as const;

export type PageCommandId = (typeof PAGE_COMMAND_IDS)[number];

export interface PageCommandDetail {
  pageId: string;
  command: string;
  /**
   * Put the block between top-level blocks: 0 is before the first block,
   * N is after the last one (a drop from the Insert tab). Omitted, the block
   * goes at the caret, or after the block the caret is in.
   */
  index?: number;
}

export function runPageCommand(detail: PageCommandDetail) {
  window.dispatchEvent(new CustomEvent(PAGE_COMMAND_EVENT, { detail }));
}

/**
 * A tool of the editor's "Page options" menu opened from outside it (the v3
 * Info tab's Versions row). Only `history` is honoured; anything else is
 * ignored.
 */
export const PAGE_TOOL_EVENT = "needt:page-tool";

export interface PageToolDetail {
  pageId: string;
  tool: string;
}

export function runPageTool(detail: PageToolDetail) {
  window.dispatchEvent(new CustomEvent(PAGE_TOOL_EVENT, { detail }));
}
