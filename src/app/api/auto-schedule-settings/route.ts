import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { parseAutoScheduleSettingsUpdate } from "@/lib/auto-schedule-settings-input";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { removeAllTaskBlocks } from "@/lib/task-block-push";
import { parseWeek } from "@/lib/work-week";
import {
  loadWeekHours,
  saveWeekHours,
  weekAfterLegacyWrite,
} from "@/lib/work-week-server";

const LOG_SOURCE = "AutoScheduleSettingsAPI";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    // Get the auto schedule settings or create default ones if they don't exist
    const settings = await prisma.autoScheduleSettings.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        workDays: JSON.stringify([1, 2, 3, 4, 5]), // Monday to Friday
        workHourStart: 9, // 9 AM
        workHourEnd: 17, // 5 PM
      },
    });

    // Per-day hours live on the default work schedule; the columns above are
    // the whole-week summary kept for older readers.
    const weekHours = await loadWeekHours(userId);
    return NextResponse.json({ ...settings, weekHours });
  } catch (error) {
    logger.error(
      "Failed to fetch auto schedule settings",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to fetch auto schedule settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Body must be a JSON object" },
        { status: 400 }
      );
    }

    const { weekHours: rawWeek, ...rest } = body as Record<string, unknown>;
    let week: ReturnType<typeof parseWeek> | null = null;
    if (rawWeek !== undefined) {
      try {
        week = parseWeek(rawWeek);
      } catch (error) {
        return NextResponse.json(
          {
            error: error instanceof Error ? error.message : "Invalid weekHours",
          },
          { status: 400 }
        );
      }
    }

    // Only the preference columns reach the database.
    const parsed = parseAutoScheduleSettingsUpdate(rest);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const updates = parsed.data;

    // The target calendar must be the caller's own. Clearing it is always fine.
    if (updates.pushTasksFeedId) {
      const feed = await prisma.calendarFeed.findFirst({
        where: { id: updates.pushTasksFeedId, userId },
        select: { id: true },
      });
      if (!feed) {
        return NextResponse.json(
          { error: "pushTasksFeedId must be one of your calendars" },
          { status: 400 }
        );
      }
    }

    // Load existing settings to detect push disable transition
    const existingSettings = await prisma.autoScheduleSettings.findUnique({
      where: { userId },
    });

    const settings = await prisma.autoScheduleSettings.upsert({
      where: { userId },
      update: updates,
      create: {
        userId,
        workDays: JSON.stringify([1, 2, 3, 4, 5]), // Monday to Friday
        workHourStart: 9, // 9 AM
        workHourEnd: 17, // 5 PM
        ...updates,
      },
    });

    if (week) {
      await saveWeekHours(userId, week);
    } else if (
      "workDays" in updates ||
      "workHourStart" in updates ||
      "workHourEnd" in updates
    ) {
      const next = weekAfterLegacyWrite(
        await loadWeekHours(userId),
        existingSettings,
        settings
      );
      if (next) await saveWeekHours(userId, next);
    }

    // If push transitions from enabled to disabled, remove all pushed events
    if (
      existingSettings?.pushTasksToCalendar === true &&
      updates.pushTasksToCalendar === false
    ) {
      logger.info(
        `Push disabled; removing all task blocks for user`,
        { userId },
        LOG_SOURCE
      );
      removeAllTaskBlocks(userId).catch((error) => {
        logger.error(
          `Failed to remove task blocks on push disable`,
          {
            userId,
            error: error instanceof Error ? error.message : String(error),
          },
          LOG_SOURCE
        );
      });
    }

    return NextResponse.json({
      ...(await prisma.autoScheduleSettings.findUnique({ where: { userId } })),
      weekHours: await loadWeekHours(userId),
    });
  } catch (error) {
    logger.error(
      "Failed to update auto schedule settings",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to update auto schedule settings" },
      { status: 500 }
    );
  }
}
