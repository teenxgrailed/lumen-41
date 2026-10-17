/**
 * The editor's side of "Export": Markdown is built from the document as it is
 * on screen (unsaved text included) and handed to the browser as a download;
 * PDF is the browser's print dialog with the page alone on the paper.
 */
import type { JSONContent } from "@tiptap/core";

import {
  exportFileName,
  titledMarkdown,
} from "@/lib/pages/export-markdown";

export function markdownOf(title: string, document: JSONContent): string {
  return titledMarkdown(title, document, {
    origin: typeof window === "undefined" ? undefined : window.location.origin,
  });
}

export function downloadMarkdown(title: string, document: JSONContent) {
  const blob = new Blob([markdownOf(title, document)], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = exportFileName(title, "md");
  link.rel = "noopener";
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  // The download has started by the time the task after the click runs.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The attribute the print stylesheet looks for on the v3 frame. */
export const PRINTING_ATTR = "data-printing";

/**
 * Print the open page. The frame is marked while the dialog is up so the
 * stylesheet (`doc-opened.css`, `@media print`) hides everything but the
 * sheet; the mark is removed when printing ends, whatever the answer.
 */
export function printPage(): boolean {
  const sheet = window.document.querySelector("[data-doc-sheet]");
  const frame = sheet?.closest(".needt-v3") ?? null;
  if (!frame) return false;
  frame.setAttribute(PRINTING_ATTR, "");
  const done = () => {
    frame.removeAttribute(PRINTING_ATTR);
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
  return true;
}
