import {
  FOLDER_STYLES,
  FOLDER_STYLE_NAMES,
  type FolderStyleId,
} from "@/lib/needt3/folder-style";

import type { CtxRow } from "../ctx/registry";

/**
 * The "Folder style…" submenu of a right-click: Auto (random) and the six
 * looks by name, a tick on the current one. Choosing the current one does
 * nothing. (The sheets show thumbnails; a menu row is text.)
 */
export function folderStyleRows(
  current: number | null,
  pick: (style: FolderStyleId | null) => void
): CtxRow[] {
  const rows: CtxRow[] = [
    {
      label: "Auto (random)",
      hint: current === null ? "✓" : undefined,
      run: () => {
        if (current !== null) pick(null);
      },
    },
  ];
  for (const n of FOLDER_STYLES)
    rows.push({
      label: FOLDER_STYLE_NAMES[n],
      hint: current === n ? "✓" : undefined,
      run: () => {
        if (current !== n) pick(n);
      },
    });
  return rows;
}
