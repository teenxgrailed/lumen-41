import { prisma } from "@/lib/prisma";

/**
 * True when `tagIds` is not a list of labels the person owns. A task's
 * labels are `Tag` rows; linking one that belongs to someone else would
 * expose its name, so the write routes refuse it.
 */
export async function hasForeignTagIds(
  userId: string,
  tagIds: unknown
): Promise<boolean> {
  if (tagIds === undefined || tagIds === null) return false;
  if (
    !Array.isArray(tagIds) ||
    tagIds.length > 50 ||
    tagIds.some((id) => typeof id !== "string" || !id)
  )
    return true;
  const unique = new Set<string>(tagIds);
  if (!unique.size) return false;
  const owned = await prisma.tag.count({
    where: { id: { in: [...unique] }, userId },
  });
  return owned !== unique.size;
}
