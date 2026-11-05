import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import {
  parseV3Fields,
  userSettingsV3FieldsSchema,
} from "@/lib/needt3/api-fields";
import {
  PREFS_FORBIDDEN_KEYS,
  PREFS_MAX_BYTES,
  PREFS_MAX_KEYS,
} from "@/lib/needt3/prefs-limits";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "UserSettingsAPI";

/** The merge would take prefs past a cap: nothing is written. */
class PrefsTooLarge extends Error {}

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
    // Checked on the raw body: JSON.parse keeps "__proto__" as an own key,
    // which a parsed copy may no longer show.
    const rawPrefs = (updates as { prefs?: unknown }).prefs;
    if (
      rawPrefs &&
      typeof rawPrefs === "object" &&
      Object.keys(rawPrefs).some((k) => PREFS_FORBIDDEN_KEYS.includes(k))
    )
      return NextResponse.json({ error: "Invalid prefs key" }, { status: 400 });
    const v3 = parseV3Fields(userSettingsV3FieldsSchema, updates);
    if (!v3.ok) {
      return NextResponse.json({ error: v3.error }, { status: 400 });
    }

    // `prefs` is a patch, merged into the stored map by Postgres in one
    // statement (`prefs || patch`), so two writers of different keys (two
    // tabs, two devices, a stale cache) both keep theirs. Only top-level keys
    // merge: a key's value (taskView, homeBlocks …) is replaced whole. A key
    // sent as null is removed. The merged map is capped in size and keys in
    // the same statement; past either, nothing is written (413). Every other
    // field is written as before, in the same transaction.
    const { prefs: prefsPatch, ...rest } = updates as Record<string, unknown>;
    const patch = prefsPatch as Record<string, unknown> | undefined;
    const put: Record<string, unknown> = Object.create(null);
    const drop: string[] = [];
    for (const [key, value] of Object.entries(patch ?? {})) {
      if (value === null) drop.push(key);
      else put[key] = value;
    }
    const putJson = JSON.stringify(put);

    const settings = await prisma.$transaction(async (tx) => {
      await tx.userSettings.upsert({
        where: { userId },
        update: rest,
        create: {
          userId,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...rest,
          prefs: {},
        },
      });
      if (patch) {
        // The merged value is spelled out in the WHERE too, so the caps are
        // checked on the row version the UPDATE writes (Postgres re-checks
        // the WHERE on the newest version when a concurrent writer won).
        const written = await tx.$executeRaw`
          UPDATE "UserSettings"
          SET "prefs" = (COALESCE("prefs", '{}'::jsonb) || ${putJson}::jsonb) - ${drop}::text[]
          WHERE "userId" = ${userId}
            AND octet_length(((COALESCE("prefs", '{}'::jsonb) || ${putJson}::jsonb) - ${drop}::text[])::text) <= ${PREFS_MAX_BYTES}
            AND (SELECT count(*) FROM jsonb_object_keys((COALESCE("prefs", '{}'::jsonb) || ${putJson}::jsonb) - ${drop}::text[])) <= ${PREFS_MAX_KEYS}`;
        if (written === 0) throw new PrefsTooLarge();
      }
      return tx.userSettings.findUnique({ where: { userId } });
    });

    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof PrefsTooLarge)
      return NextResponse.json(
        {
          error: `Preferences are full (at most ${PREFS_MAX_KEYS} keys, ${PREFS_MAX_BYTES} bytes). Remove some with null.`,
        },
        { status: 413 }
      );
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
