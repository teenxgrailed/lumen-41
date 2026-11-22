import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "PopupSettingsAPI";

export const runtime = "nodejs";

const bodySchema = z.object({ productUpdates: z.boolean() }).strict();

/** GET /api/popups/settings: `{ productUpdates }`, on until the person turns it off. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const row = await prisma.userSettings.findUnique({
    where: { userId: auth.userId },
    select: { productUpdates: true },
  });
  return NextResponse.json({ productUpdates: row?.productUpdates ?? true });
}

/**
 * PATCH /api/popups/settings `{ productUpdates }`. Off hides announcements
 * only; a plan limit that blocks an action or a trial ending still gets its
 * popup.
 */
export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That is not valid." }, { status: 400 });
  }
  const row = await prisma.userSettings.upsert({
    where: { userId: auth.userId },
    update: { productUpdates: parsed.data.productUpdates },
    create: {
      userId: auth.userId,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      productUpdates: parsed.data.productUpdates,
    },
    select: { productUpdates: true },
  });
  return NextResponse.json({ productUpdates: row.productUpdates });
}
