/**
 * The name of one document, moodboard or project for its tab title.
 *
 * Only what the signed-in person owns or was granted by name is read; an item
 * reachable only through workspace inheritance falls back to its section's
 * title (see `itemTitle`), which keeps this to one indexed lookup and never
 * leaks a name the person could not open.
 */
import { getServerSession } from "next-auth";

import { getAuthOptions } from "@/lib/auth/auth-options";
import { logger } from "@/lib/logger";
import { itemTitle } from "@/lib/needt3/section-titles";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "item-titles";

async function lookup(
  kind: string,
  find: (userId: string) => Promise<string | null | undefined>
): Promise<string | null> {
  try {
    const session = await getServerSession(await getAuthOptions());
    const userId = session?.user?.id;
    if (!userId) return null;
    return (await find(userId)) ?? null;
  } catch (error) {
    logger.warn(
      `Could not read the ${kind} title`,
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return null;
  }
}

export async function documentTabTitle(id: string): Promise<string> {
  const name = await lookup("document", async (userId) => {
    const page = await prisma.page.findFirst({
      where: {
        id,
        trashedAt: null,
        OR: [{ userId }, { accessGrants: { some: { userId } } }],
      },
      select: { title: true },
    });
    return page?.title;
  });
  return itemTitle(name, "docs");
}

export async function moodboardTabTitle(id: string): Promise<string> {
  const name = await lookup("moodboard", async (userId) => {
    const board = await prisma.moodboard.findFirst({
      where: {
        id,
        archivedAt: null,
        trashedAt: null,
        OR: [{ createdById: userId }, { accessGrants: { some: { userId } } }],
      },
      select: { title: true },
    });
    return board?.title;
  });
  return itemTitle(name, "moodboards");
}

export async function projectTabTitle(id: string): Promise<string> {
  const name = await lookup("project", async (userId) => {
    const project = await prisma.project.findFirst({
      where: { id, userId },
      select: { name: true },
    });
    return project?.name;
  });
  return itemTitle(name, "projects");
}
