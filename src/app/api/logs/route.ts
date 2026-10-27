import { NextRequest, NextResponse } from "next/server";

import { queryAdminLogs } from "@/services/admin/logs";
import { Prisma } from "@prisma/client";

import { requireAdmin } from "@/lib/auth/api-auth";
import { newDate, subDays } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "LogsAPI";

export async function GET(request: NextRequest) {
  // Check if user is admin
  const authResponse = await requireAdmin(request);
  if (authResponse) return authResponse;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const level = searchParams.get("level");
    const source = searchParams.get("source");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const search = searchParams.get("search");

    logger.debug(
      "Fetching logs with params",
      {
        page: String(page),
        limit: String(limit),
        level: level || "none",
        source: source || "none",
        from: from || "none",
        to: to || "none",
        search: search || "none",
      },
      LOG_SOURCE
    );

    const result = await queryAdminLogs({
      page,
      limit,
      level,
      source,
      from,
      to,
      search,
    });

    logger.debug(
      "Successfully fetched logs",
      {
        totalLogs: String(result.pagination.total),
        returnedLogs: String(result.logs.length),
      },
      LOG_SOURCE
    );

    return NextResponse.json(result);
  } catch (error) {
    logger.error(
      "Failed to fetch logs",
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to fetch logs" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  // Check if user is admin
  const authResponse = await requireAdmin(request);
  if (authResponse) return authResponse;

  try {
    const { searchParams } = new URL(request.url);
    const olderThan = searchParams.get("olderThan"); // days
    const level = searchParams.get("level");

    logger.info(
      "Deleting logs",
      {
        olderThan: olderThan || "none",
        level: level || "none",
      },
      LOG_SOURCE
    );

    const where: Prisma.LogWhereInput = {};

    // Delete logs older than specified days
    if (olderThan) {
      where.timestamp = {
        lt: subDays(newDate(), parseInt(olderThan)),
      };
    }

    // Delete logs of specific level
    if (level) {
      where.level = level;
    }

    // Delete expired logs if no filters provided
    if (!olderThan && !level) {
      where.expiresAt = {
        lt: newDate(),
      };
    }

    const { count } = await prisma.log.deleteMany({ where });

    logger.info(
      "Successfully deleted logs",
      {
        deletedCount: String(count),
      },
      LOG_SOURCE
    );

    return NextResponse.json({
      message: `Deleted ${count} logs`,
      count,
    });
  } catch (error) {
    logger.error(
      "Failed to delete logs",
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to delete logs" },
      { status: 500 }
    );
  }
}
