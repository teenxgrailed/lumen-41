import type { Prisma } from "@prisma/client";

import {
  type MenuLayout,
  type MenuTile,
  type MenuLayoutPatch,
  layoutFromRow,
} from "@/lib/phone-menu/layout";
import { prisma } from "@/lib/prisma";

/** The account's menu layout; the default set while the person has never changed it. */
export async function getMenuLayout(userId: string): Promise<MenuLayout> {
  const row = await prisma.phoneMenuLayout.findUnique({ where: { userId } });
  return layoutFromRow(row);
}

/**
 * Changes the style, the tiles, or both. A part that is not sent is left as
 * it is; the first write makes the row, taking the default for the other part.
 */
/** A tile list is plain JSON; Prisma's input type wants it said. */
const json = (tiles: MenuTile[]) => tiles as unknown as Prisma.InputJsonValue;

export async function updateMenuLayout(
  userId: string,
  patch: MenuLayoutPatch
): Promise<MenuLayout> {
  const current = await getMenuLayout(userId);
  const next: MenuLayout = {
    style: patch.style ?? current.style,
    tiles: patch.tiles ?? current.tiles,
  };
  const row = await prisma.phoneMenuLayout.upsert({
    where: { userId },
    update: { style: next.style, tiles: json(next.tiles) },
    create: { userId, style: next.style, tiles: json(next.tiles) },
  });
  return layoutFromRow(row);
}

/** Back to the default set (and the default style): the row goes away. */
export async function resetMenuLayout(userId: string): Promise<MenuLayout> {
  await prisma.phoneMenuLayout.deleteMany({ where: { userId } });
  return layoutFromRow(null);
}
