import { z } from "zod";

/**
 * The phone app menu's tiles (owner decisions 2026-11-20, day-plan design.md
 * D item 8). One list per account, stored on the server and read and written
 * through `/api/phone-menu`, so a person (or a script of theirs) can arrange
 * the menu from anywhere. Pure: no database and no React in this file.
 */

/** The catalogue a person picks from. */
export const MENU_TILE_IDS = [
  "today",
  "focus",
  "habits",
  "inbox",
  "calendar",
  "mail",
  "docs",
  "ask",
  "streak",
  "project",
] as const;
export type MenuTileId = (typeof MENU_TILE_IDS)[number];

export const MENU_TILE_SIZES = ["1x1", "2x1"] as const;
export type MenuTileSize = (typeof MENU_TILE_SIZES)[number];

/** The two looks of the menu: tiles (new) or the older card. */
export const MENU_STYLES = ["tiles", "card"] as const;
export type MenuStyle = (typeof MENU_STYLES)[number];

/** More than this would push the grid past a phone screen of its own. */
export const MENU_TILE_MAX = 12;

export interface MenuTile {
  id: MenuTileId;
  size: MenuTileSize;
  /** Only a Project folder tile: the project it opens. */
  projectId?: string;
}

/** What a new account (and a Reset) starts with. */
export const DEFAULT_MENU_TILES: readonly MenuTile[] = [
  { id: "today", size: "1x1" },
  { id: "focus", size: "1x1" },
  { id: "calendar", size: "1x1" },
  { id: "habits", size: "1x1" },
];

/** The size a tile is added at. */
export const DEFAULT_TILE_SIZE: Record<MenuTileId, MenuTileSize> = {
  today: "1x1",
  focus: "1x1",
  habits: "1x1",
  inbox: "1x1",
  calendar: "1x1",
  mail: "1x1",
  docs: "1x1",
  ask: "2x1",
  streak: "1x1",
  project: "1x1",
};

const tileSchema = z
  .object({
    id: z.enum(MENU_TILE_IDS),
    size: z.enum(MENU_TILE_SIZES),
    projectId: z.string().min(1).max(64).optional(),
  })
  .strict()
  .superRefine((tile, ctx) => {
    if (tile.id === "project" && !tile.projectId)
      ctx.addIssue({
        code: "custom",
        message: "A project tile needs a projectId",
      });
    if (tile.id !== "project" && tile.projectId !== undefined)
      ctx.addIssue({
        code: "custom",
        message: "Only a project tile has a projectId",
      });
  });

/** One tile's identity in a list. */
export function tileKey(t: Pick<MenuTile, "id" | "projectId">): string {
  return t.id === "project" ? `project:${t.projectId ?? ""}` : t.id;
}

/** An ordered list: no repeats (a project repeats only with another project). */
export const menuTilesSchema = z
  .array(tileSchema)
  .max(MENU_TILE_MAX, `At most ${MENU_TILE_MAX} tiles`)
  .superRefine((tiles, ctx) => {
    const seen = new Set<string>();
    for (const t of tiles) {
      const key = tileKey(t);
      if (seen.has(key))
        ctx.addIssue({ code: "custom", message: `Repeated tile ${key}` });
      seen.add(key);
    }
  });

/** The body of PUT /api/phone-menu: either part, or both. */
export const menuLayoutPatchSchema = z
  .object({
    style: z.enum(MENU_STYLES).optional(),
    tiles: menuTilesSchema.optional(),
  })
  .strict()
  .refine((b) => b.style !== undefined || b.tiles !== undefined, {
    message: "Send style, tiles, or both",
  });
export type MenuLayoutPatch = z.infer<typeof menuLayoutPatchSchema>;

export interface MenuLayout {
  style: MenuStyle;
  tiles: MenuTile[];
}

/**
 * What the database holds, made safe: a stored list that no longer validates
 * (a tile removed from the catalogue, a hand edit) falls back to the default
 * set instead of breaking the menu. An empty list is a real choice and stays.
 */
export function layoutFromRow(
  row: { style?: unknown; tiles?: unknown } | null
): MenuLayout {
  const style: MenuStyle = row?.style === "card" ? "card" : "tiles";
  if (!row) return { style, tiles: [...DEFAULT_MENU_TILES] };
  const parsed = menuTilesSchema.safeParse(row.tiles);
  return {
    style,
    tiles: parsed.success ? parsed.data : [...DEFAULT_MENU_TILES],
  };
}

/** The catalogue entries not on the grid yet (a project is always addable). */
export function addableTiles(tiles: readonly MenuTile[]): MenuTileId[] {
  const on = new Set(tiles.map((t) => t.id));
  return MENU_TILE_IDS.filter((id) => id === "project" || !on.has(id));
}

/** Move one tile from `from` to `to`; out-of-range indexes leave the list as it was. */
export function moveTile(
  tiles: readonly MenuTile[],
  from: number,
  to: number
): MenuTile[] {
  const out = [...tiles];
  if (from < 0 || from >= out.length || to < 0 || to >= out.length) return out;
  const [t] = out.splice(from, 1);
  out.splice(to, 0, t);
  return out;
}
