import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  OPTIONAL_CATEGORIES,
  type OptionalCategory,
} from "@/lib/email/categories";
import {
  getPreferences,
  setCategory,
  setFewerEmails,
} from "@/lib/email/preferences";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "EmailPreferencesAPI";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    tips: z.boolean(),
    offers: z.boolean(),
    updates: z.boolean(),
    recap: z.boolean(),
    fewer: z.boolean(),
  })
  .partial()
  .strict();

/** GET /api/email-preferences : the signed-in person's optional-email choices. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const preferences = await getPreferences(auth.userId);
  if (!preferences) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    ...preferences.categories,
    fewer: preferences.fewer,
  });
}

/** PATCH /api/email-preferences : change any of the four categories or "fewer". */
export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That is not valid." }, { status: 400 });
  }
  try {
    for (const category of OPTIONAL_CATEGORIES as readonly OptionalCategory[]) {
      const value = parsed.data[category];
      if (typeof value === "boolean") {
        await setCategory(auth.userId, category, value, "settings");
      }
    }
    if (typeof parsed.data.fewer === "boolean") {
      await setFewerEmails(auth.userId, parsed.data.fewer);
    }
    const preferences = await getPreferences(auth.userId);
    return NextResponse.json({
      ...preferences?.categories,
      fewer: preferences?.fewer ?? false,
    });
  } catch (error) {
    logger.error(
      "Could not save email preferences",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Not saved." }, { status: 500 });
  }
}
