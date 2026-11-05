import { NextRequest, NextResponse } from "next/server";

import type { Prisma } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import {
  parseV3Fields,
  userSettingsV3FieldsSchema,
} from "@/lib/needt3/api-fields";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "UserSettingsAPI";

export async function GET(request: NextRequest) {
  try {
    // Authenticate the request
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    // Get the user settings or create default ones if they don't exist
    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    });

    return NextResponse.json(settings);
  } catch (error) {
    logger.error(
      "Failed to fetch user settings",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to fetch user settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // Authenticate the request
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const updates = await request.json().catch(() => null);
    if (!updates || typeof updates !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const v3 = parseV3Fields(userSettingsV3FieldsSchema, updates);
    if (!v3.ok) {
      return NextResponse.json({ error: v3.error }, { status: 400 });
    }

    // `prefs` is a patch, merged into the stored map by Postgres in one
    // statement (`prefs || patch`), so two writers of different keys (two
    // tabs, two devices, a stale cache) both keep theirs. A key sent as null
    // is removed. Every other field is written as before.
    const { prefs: prefsPatch, ...rest } = updates as Record<string, unknown>;
    const patch = prefsPatch as Record<string, unknown> | undefined;
    const put: Record<string, unknown> = {};
    const drop: string[] = [];
    for (const [key, value] of Object.entries(patch ?? {})) {
      if (value === null) drop.push(key);
      else put[key] = value;
    }

    await prisma.userSettings.upsert({
      where: { userId },
      update: rest,
      create: {
        userId,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...rest,
        prefs: put as Prisma.InputJsonObject,
      },
    });
    if (patch) {
      await prisma.$executeRaw`
        UPDATE "UserSettings"
        SET "prefs" = (COALESCE("prefs", '{}'::jsonb) || ${JSON.stringify(put)}::jsonb) - ${drop}::text[]
        WHERE "userId" = ${userId}`;
    }
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    return NextResponse.json(settings);
  } catch (error) {
    logger.error(
      "Failed to update user settings",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to update user settings" },
      { status: 500 }
    );
  }
}
