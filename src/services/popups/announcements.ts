import {
  type Announcement,
  AnnouncementStatus,
  Prisma,
} from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import type {
  AnnouncementCreateInput,
  AnnouncementUpdateInput,
} from "@/lib/popups/schema";
import { prisma } from "@/lib/prisma";

export interface AnnouncementStats {
  shown: number;
  clicked: number;
  dismissed: number;
}

export type AdminAnnouncement = Announcement & { stats: AnnouncementStats };

const EMPTY_STATS: AnnouncementStats = { shown: 0, clicked: 0, dismissed: 0 };

/** shown / clicked / dismissed per announcement, in three grouped counts. */
async function statsFor(
  ids: string[]
): Promise<Map<string, AnnouncementStats>> {
  const out = new Map<string, AnnouncementStats>();
  if (ids.length === 0) return out;
  const [shown, clicked, dismissed] = await Promise.all([
    prisma.announcementView.groupBy({
      by: ["announcementId"],
      where: { announcementId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.announcementView.groupBy({
      by: ["announcementId"],
      where: { announcementId: { in: ids }, clickedAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.announcementView.groupBy({
      by: ["announcementId"],
      where: { announcementId: { in: ids }, dismissedAt: { not: null } },
      _count: { _all: true },
    }),
  ]);
  for (const id of ids) out.set(id, { ...EMPTY_STATS });
  for (const row of shown) {
    const s = out.get(row.announcementId);
    if (s) s.shown = row._count._all;
  }
  for (const row of clicked) {
    const s = out.get(row.announcementId);
    if (s) s.clicked = row._count._all;
  }
  for (const row of dismissed) {
    const s = out.get(row.announcementId);
    if (s) s.dismissed = row._count._all;
  }
  return out;
}

export async function listAnnouncements(): Promise<AdminAnnouncement[]> {
  const rows = await prisma.announcement.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 200,
  });
  const stats = await statsFor(rows.map((r) => r.id));
  return rows.map((row) => ({
    ...row,
    stats: stats.get(row.id) ?? { ...EMPTY_STATS },
  }));
}

export async function getAnnouncement(
  id: string
): Promise<AdminAnnouncement | null> {
  const row = await prisma.announcement.findUnique({ where: { id } });
  if (!row) return null;
  const stats = await statsFor([id]);
  return { ...row, stats: stats.get(id) ?? { ...EMPTY_STATS } };
}

export type MutationResult =
  | { ok: true; announcement: Announcement }
  | { ok: false; code: "not_found" | "slug_taken" };

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/** A new announcement is always a draft; publishing is its own call. */
export async function createAnnouncement(
  input: AnnouncementCreateInput
): Promise<MutationResult> {
  try {
    const announcement = await prisma.announcement.create({
      data: {
        ...input,
        bullets: input.bullets as unknown as Prisma.InputJsonValue,
        primaryCta:
          input.primaryCta === null
            ? Prisma.JsonNull
            : (input.primaryCta as unknown as Prisma.InputJsonValue),
        status: AnnouncementStatus.draft,
      },
    });
    return { ok: true, announcement };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, code: "slug_taken" };
    throw error;
  }
}

export async function updateAnnouncement(
  id: string,
  input: AnnouncementUpdateInput
): Promise<MutationResult> {
  const { bullets, primaryCta, ...rest } = input;
  try {
    const announcement = await prisma.announcement.update({
      where: { id },
      data: {
        ...rest,
        ...(bullets !== undefined && {
          bullets: bullets as unknown as Prisma.InputJsonValue,
        }),
        ...(primaryCta !== undefined && {
          primaryCta:
            primaryCta === null
              ? Prisma.JsonNull
              : (primaryCta as unknown as Prisma.InputJsonValue),
        }),
      },
    });
    return { ok: true, announcement };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, code: "slug_taken" };
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return { ok: false, code: "not_found" };
    }
    throw error;
  }
}

/** Publish or pull back to a draft. Only an admin reaches this (the route checks). */
export async function setAnnouncementStatus(
  id: string,
  status: AnnouncementStatus
): Promise<MutationResult> {
  try {
    const announcement = await prisma.announcement.update({
      where: { id },
      data: {
        status,
        ...(status === AnnouncementStatus.published && {
          publishedAt: newDate(),
        }),
      },
    });
    return { ok: true, announcement };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return { ok: false, code: "not_found" };
    }
    throw error;
  }
}

export async function deleteAnnouncement(id: string): Promise<boolean> {
  const result = await prisma.announcement.deleteMany({ where: { id } });
  return result.count > 0;
}
