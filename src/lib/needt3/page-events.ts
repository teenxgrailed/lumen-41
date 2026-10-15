import type { PagePreviewBlock } from "@/lib/pages/page-preview";

/**
 * The editor (`PageWorkspace`) writes a page's title, icon, pin and cover to
 * the API itself. It announces each write with this window event, so the v3
 * chrome (breadcrumb, rail, grid, pinned list) can follow without a refetch
 * of the whole page (see `usePageEditSync` in hooks/docs).
 */
export const PAGE_PATCHED_EVENT = "needt:page-patched";

export interface PagePatchedDetail {
  pageId: string;
  values: Record<string, unknown>;
  /**
   * Who wrote: the editor (default) tells the chrome's caches; the chrome
   * (the Info tab's Pin) tells the editor, whose own copy of the field would
   * otherwise stay behind.
   */
  from?: "editor" | "chrome";
}

export function announcePagePatched(detail: PagePatchedDetail) {
  window.dispatchEvent(new CustomEvent(PAGE_PATCHED_EVENT, { detail }));
}

/**
 * The editor tells the chrome what the first lines of the page now look like
 * (after a pause in typing, and when the page is left), so the Docs grid, the
 * Pinned faces and the rail thumb show the edit without a refetch.
 */
export const PAGE_PREVIEW_EVENT = "needt:page-preview";

export interface PagePreviewDetail {
  pageId: string;
  preview: PagePreviewBlock[];
}

export function announcePagePreview(detail: PagePreviewDetail) {
  window.dispatchEvent(new CustomEvent(PAGE_PREVIEW_EVENT, { detail }));
}

/** The fields of a patch the v3 document model carries. */
export function docFieldsOf(values: Record<string, unknown>) {
  const out: {
    title?: string;
    icon?: string | null;
    isFavorite?: boolean;
    coverUrl?: string | null;
  } = {};
  if (typeof values.title === "string") out.title = values.title;
  if (values.icon === null || typeof values.icon === "string")
    out.icon = values.icon as string | null;
  if (typeof values.isFavorite === "boolean")
    out.isFavorite = values.isFavorite;
  if (values.coverUrl === null || typeof values.coverUrl === "string")
    out.coverUrl = values.coverUrl as string | null;
  return out;
}
