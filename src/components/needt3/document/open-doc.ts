"use client";

import { usePathname } from "next/navigation";

/** `/pages/<id>` is the open document; `/pages` (the grid) and every other place is not. */
export function docIdFromPath(path: string | null | undefined): string | null {
  const m = /^\/pages\/([^/?#]+)\/?$/.exec(path ?? "");
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export function useOpenDocId(): string | null {
  return docIdFromPath(usePathname());
}
