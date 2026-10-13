/**
 * The marker that tells a rich (HTML) task description from plain text.
 * Import-free on purpose: the worker bundle reads it without pulling in the
 * sanitizer, whose jsdom cannot run inside the esbuild worker bundle.
 */
export const RICH_TEXT_DESCRIPTION_PREFIX = "<!--needt-rich-text:v1-->";

/**
 * Plain-text description ready to store, for writers that never produce
 * rich text (importers). A value that claims the rich marker is stored as
 * plain text without it, so no unsanitized HTML is ever stored as rich.
 */
export function plainTaskDescriptionForStorage(
  value: unknown
): string | undefined {
  if (typeof value !== "string") return undefined;
  let text = value.trim();
  while (text.startsWith(RICH_TEXT_DESCRIPTION_PREFIX)) {
    text = text.slice(RICH_TEXT_DESCRIPTION_PREFIX.length).trim();
  }
  return text || undefined;
}
