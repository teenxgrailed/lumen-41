/**
 * The six folder looks (Projects, Docs, Learn). A folder wears the style its
 * owner picked (`Project.folderStyle`, 1..6) or, when none is stored (Auto),
 * one chosen from its id, so folders differ from each other and a folder never
 * changes look between reloads or devices.
 */

export const FOLDER_STYLES = [1, 2, 3, 4, 5, 6] as const;
export type FolderStyleId = (typeof FOLDER_STYLES)[number];

export const FOLDER_STYLE_NAMES: Readonly<Record<FolderStyleId, string>> = {
  1: "Frosted white",
  2: "Coloured glass",
  3: "Papers peeking",
  4: "Stamp and clip",
  5: "App icons",
  6: "Dark frosted",
};

export function isFolderStyle(v: unknown): v is FolderStyleId {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 6;
}

/**
 * A stable 32-bit hash of an id: FNV-1a over the UTF-16 units, then the
 * murmur3 finaliser. FNV alone leaves the low bits of cuid-like ids (which
 * share long prefixes) lopsided; the finaliser spreads every input bit over
 * all output bits, so `% 6` is close to uniform.
 */
export function folderHash(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** The Auto style of an id: the same id always gives the same style. */
export function autoFolderStyle(id: string): FolderStyleId {
  return FOLDER_STYLES[folderHash(id) % FOLDER_STYLES.length];
}

/** What a folder wears: the stored choice, else Auto from its id. */
export function folderStyleOf(
  id: string,
  stored?: number | null
): FolderStyleId {
  return isFolderStyle(stored) ? stored : autoFolderStyle(id);
}

const MIN = 60_000;

/** "12m", "2h", "3d": how long ago, as one short token ("" when unknown). */
export function agoToken(at: number | null | undefined, now: number): string {
  if (at == null || Number.isNaN(at)) return "";
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
