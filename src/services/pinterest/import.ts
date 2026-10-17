import { SafeFetchError, safeDownload } from "@/services/imports/safe-fetch";
import {
  MOODBOARD_IMAGE_MAX_BYTES,
  MoodboardItemLimitError,
  assertCanWriteMoodboard,
  createMoodboardImage,
  sniffImageType,
} from "@/services/moodboards/moodboard-item-service";
import { WorkspaceRole } from "@prisma/client";

import type { MoodboardAccessActor } from "@/lib/auth/moodboard-auth";
import {
  WorkspaceAuthorizationError,
  resolveWorkspaceAccess,
} from "@/lib/auth/workspace-auth";
import { newDate, subHours } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import {
  PinterestApiError,
  type PinterestPin,
  listPinterestPins,
} from "./client";
import {
  assertPinterestPlan,
  hasPinterestPlan,
  withPinterest,
} from "./connection";

const LOG_SOURCE = "PinterestImport";

/** Pins fetched and copied per import run (two Pinterest pages of 50). */
export const IMPORT_MAX_PINS = 100;
const SEEN_CAP = 3000;
const DOWNLOAD_CONCURRENCY = 4;
const DOWNLOAD_TIMEOUT_MS = 15_000;

/** Pinterest serves Pin pictures from pinimg.com only. */
export const isPinimgHost = (host: string) =>
  host === "pinimg.com" || host.endsWith(".pinimg.com");

export interface PinterestImportResult {
  imported: number;
  /** Pins already on the board (or removed from it earlier), left alone. */
  skipped: number;
  /** Pins whose picture could not be copied (too large, not a picture, gone). */
  failed: number;
  /** The board has no room for more. */
  full: boolean;
}

type Download = typeof safeDownload;

/**
 * Copies one Pin's picture onto the board: the first candidate size that the
 * safe download accepts (https, public address, pinimg.com only, within the
 * moodboard picture limit) and whose bytes really are a picture.
 */
async function copyPin(
  actor: MoodboardAccessActor,
  moodboardId: string,
  pin: PinterestPin,
  download: Download
): Promise<"imported" | "failed"> {
  for (const image of pin.images) {
    try {
      const file = await download(image.url, {
        maxBytes: MOODBOARD_IMAGE_MAX_BYTES,
        timeoutMs: DOWNLOAD_TIMEOUT_MS,
        allowHost: isPinimgHost,
      });
      if (!sniffImageType(file.bytes)) continue;
      const ratio =
        image.width && image.height ? image.width / image.height : null;
      await createMoodboardImage(actor, moodboardId, {
        bytes: file.bytes,
        name: `pin-${pin.id}`,
        title: pin.title ?? pin.description?.slice(0, 120) ?? null,
        ratio,
        origin: {
          name: "Pinterest",
          domain: "pinterest.com",
          url: pin.pinUrl,
        },
      });
      return "imported";
    } catch (error) {
      if (error instanceof MoodboardItemLimitError) throw error;
      // Too large at this size, blocked or gone: try the next size.
      if (!(error instanceof SafeFetchError)) {
        await logger.warn(
          "Could not store a Pinterest picture",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
        return "failed";
      }
    }
  }
  return "failed";
}

/** Copies the Pins onto the board, a few at a time; stops when the board is full. */
export async function copyPins(
  actor: MoodboardAccessActor,
  moodboardId: string,
  pins: PinterestPin[],
  download: Download = safeDownload
) {
  let imported = 0;
  let failed = 0;
  let full = false;
  const done: string[] = [];
  for (let i = 0; i < pins.length && !full; i += DOWNLOAD_CONCURRENCY) {
    const batch = pins.slice(i, i + DOWNLOAD_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (pin) => {
        try {
          return await copyPin(actor, moodboardId, pin, download);
        } catch (error) {
          if (error instanceof MoodboardItemLimitError) return "full" as const;
          throw error;
        }
      })
    );
    results.forEach((r, j) => {
      if (r === "full") full = true;
      else {
        done.push(batch[j].id);
        if (r === "imported") imported += 1;
        else failed += 1;
      }
    });
  }
  return { imported, failed, full, done };
}

async function recordSeen(moodboardId: string, ids: string[]) {
  const row = await prisma.moodboard.findUnique({
    where: { id: moodboardId },
    select: { pinterestSeen: true },
  });
  const merged = [...new Set([...(row?.pinterestSeen ?? []), ...ids])].slice(
    -SEEN_CAP
  );
  return merged;
}

/**
 * Import a Pinterest board into a moodboard, once. Pins already seen on this
 * board (imported, or imported and then removed by the person) are skipped, so
 * running it again only adds what is new.
 */
export async function importPinterestBoard(
  actor: MoodboardAccessActor,
  moodboardId: string,
  input: { pinterestBoardId: string; keepInSync: boolean },
  download: Download = safeDownload
): Promise<PinterestImportResult> {
  await assertPinterestPlan(actor.userId);
  await assertCanWriteMoodboard(actor, moodboardId);

  const board = await prisma.moodboard.findUnique({
    where: { id: moodboardId },
    select: { pinterestBoardId: true, pinterestSeen: true },
  });
  // Another source board starts a fresh history for this moodboard.
  const seen = new Set(
    board?.pinterestBoardId === input.pinterestBoardId
      ? board.pinterestSeen
      : []
  );

  const fresh: PinterestPin[] = [];
  let skipped = 0;
  let bookmark: string | null = null;
  await withPinterest(actor.userId, async (token) => {
    for (let page = 0; page < 2 && fresh.length < IMPORT_MAX_PINS; page += 1) {
      const result = await listPinterestPins(token, input.pinterestBoardId, {
        bookmark,
        pageSize: 50,
      });
      for (const pin of result.pins) {
        if (seen.has(pin.id)) skipped += 1;
        else if (pin.images.length) fresh.push(pin);
        else skipped += 1;
      }
      bookmark = result.bookmark;
      if (!bookmark) break;
    }
  });

  const copied = await copyPins(
    actor,
    moodboardId,
    fresh.slice(0, IMPORT_MAX_PINS),
    download
  );
  const keep =
    board?.pinterestBoardId === input.pinterestBoardId
      ? await recordSeen(moodboardId, copied.done)
      : copied.done;
  const now = newDate();
  await prisma.moodboard.update({
    where: { id: moodboardId },
    data: {
      pinterestBoardId: input.pinterestBoardId,
      pinterestStatus: "ok",
      pinterestSyncedAt: now,
      pinterestSync: input.keepInSync,
      pinterestConnectedById: actor.userId,
      pinterestSeen: keep,
    },
    select: { id: true },
  });
  return {
    imported: copied.imported,
    skipped,
    failed: copied.failed,
    full: copied.full,
  };
}

/* ---------- the daily sync ---------- */

/** Pinterest's trial tier allows 1000 calls a day for the whole app. */
export const SYNC_REQUEST_BUDGET = 200;
const SYNC_EVERY_HOURS = 23;
const SYNC_BATCH = 50;

export interface PinterestSyncReport {
  checked: number;
  added: number;
  stopped: "rate_limited" | "budget" | null;
}

/**
 * The worker's periodic pass. Append-only: every synced moodboard is asked for
 * the first page of its Pinterest board (one call), and Pins not seen before
 * are added. Nothing is removed or changed. A board is looked at at most once
 * in 23 hours. A token Pinterest turns down marks the connection as needing a
 * reconnect and that person's boards are skipped; a 429 ends the pass.
 */
export async function syncPinterestBoards(
  options: { budget?: number; download?: Download } = {}
): Promise<PinterestSyncReport> {
  let budget = options.budget ?? SYNC_REQUEST_BUDGET;
  const due = await prisma.moodboard.findMany({
    where: {
      pinterestSync: true,
      pinterestBoardId: { not: null },
      pinterestConnectedById: { not: null },
      trashedAt: null,
      archivedAt: null,
      OR: [
        { pinterestSyncedAt: null },
        { pinterestSyncedAt: { lt: subHours(newDate(), SYNC_EVERY_HOURS) } },
      ],
    },
    orderBy: { pinterestSyncedAt: { sort: "asc", nulls: "first" } },
    take: SYNC_BATCH,
    select: {
      id: true,
      workspaceId: true,
      pinterestBoardId: true,
      pinterestConnectedById: true,
      pinterestSeen: true,
    },
  });
  const report: PinterestSyncReport = { checked: 0, added: 0, stopped: null };
  const blocked = new Set<string>();
  for (const b of due) {
    const userId = b.pinterestConnectedById as string;
    if (blocked.has(userId)) continue;
    if (budget <= 0) {
      report.stopped = "budget";
      break;
    }
    try {
      if (!(await hasPinterestPlan(userId))) continue;
      const workspace = await resolveWorkspaceAccess({
        userId,
        requestedWorkspaceId: b.workspaceId,
        requiredRole: WorkspaceRole.EDITOR,
      });
      const actor = { userId, workspace };
      budget -= 1;
      report.checked += 1;
      const page = await withPinterest(userId, (token) =>
        listPinterestPins(token, b.pinterestBoardId as string, {
          pageSize: 50,
        })
      );
      const seen = new Set(b.pinterestSeen);
      const fresh = page.pins.filter((p) => !seen.has(p.id) && p.images.length);
      const copied = fresh.length
        ? await copyPins(actor, b.id, fresh, options.download)
        : { imported: 0, done: [] as string[] };
      report.added += copied.imported;
      await prisma.moodboard.update({
        where: { id: b.id },
        data: {
          pinterestSyncedAt: newDate(),
          pinterestStatus: "ok",
          pinterestSeen: [...b.pinterestSeen, ...copied.done].slice(-SEEN_CAP),
        },
        select: { id: true },
      });
    } catch (error) {
      if (error instanceof PinterestApiError) {
        if (error.code === "unauthorized") {
          blocked.add(userId);
          continue;
        }
        if (error.code === "rate_limited") {
          report.stopped = "rate_limited";
          break;
        }
        if (error.code === "not_found") {
          // The source board is gone: stop syncing it, keep what was imported.
          await prisma.moodboard.update({
            where: { id: b.id },
            data: { pinterestSync: false, pinterestStatus: "lost" },
            select: { id: true },
          });
          continue;
        }
        if (error.code === "access_denied" || error.code === "forbidden") {
          await prisma.moodboard.update({
            where: { id: b.id },
            data: { pinterestSync: false, pinterestStatus: "lost" },
            select: { id: true },
          });
          continue;
        }
      } else if (error instanceof WorkspaceAuthorizationError) {
        await prisma.moodboard.update({
          where: { id: b.id },
          data: { pinterestSync: false },
          select: { id: true },
        });
        continue;
      }
      await logger.warn(
        "Pinterest sync failed for a moodboard",
        {
          moodboardId: b.id,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    }
  }
  return report;
}
