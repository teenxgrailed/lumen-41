import { NextRequest, NextResponse } from "next/server";

import { assertCanWriteMoodboard } from "@/services/moodboards/moodboard-item-service";
import { pinterestErrorResponse } from "@/services/pinterest/http";
import { importPinterestBoard } from "@/services/pinterest/import";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "MoodboardPinterestAPI";
type RouteContext = { params: Promise<{ id: string }> };

const importSchema = z
  .object({
    pinterestBoardId: z
      .string()
      .trim()
      .regex(/^\d{1,30}$/, "Choose a Pinterest board"),
    keepInSync: z.boolean().optional(),
  })
  .strict();

const syncSchema = z.object({ keepInSync: z.boolean() }).strict();

async function body<T>(request: NextRequest, schema: z.ZodType<T>) {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  return parsed.success
    ? { ok: true as const, data: parsed.data }
    : {
        ok: false as const,
        response: NextResponse.json(
          { error: "Invalid request", issues: parsed.error.issues },
          { status: 400 }
        ),
      };
}

/**
 * Import a Pinterest board's Pins onto this moodboard as pictures (each keeps
 * its Pin link). Running it again adds only Pins not seen before.
 * `keepInSync: true` also lets the daily worker pass append new Pins.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = await body(request, importSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const result = await importPinterestBoard(auth, id, {
      pinterestBoardId: parsed.data.pinterestBoardId,
      keepInSync: parsed.data.keepInSync ?? false,
    });
    return NextResponse.json(result);
  } catch (error) {
    return pinterestErrorResponse(
      error,
      "Failed to import from Pinterest",
      LOG_SOURCE,
      "Could not import from Pinterest."
    );
  }
}

/** Turn "Keep in sync" on or off for a board that is already linked. */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = await body(request, syncSchema);
  if (!parsed.ok) return parsed.response;
  try {
    await assertCanWriteMoodboard(auth, id);
    const board = await prisma.moodboard.findUnique({
      where: { id },
      select: { pinterestBoardId: true },
    });
    if (!board?.pinterestBoardId) {
      return NextResponse.json(
        { error: "Import a Pinterest board first" },
        { status: 409 }
      );
    }
    await prisma.moodboard.update({
      where: { id },
      data: {
        pinterestSync: parsed.data.keepInSync,
        ...(parsed.data.keepInSync
          ? { pinterestConnectedById: auth.userId }
          : {}),
      },
      select: { id: true },
    });
    return NextResponse.json({ keepInSync: parsed.data.keepInSync });
  } catch (error) {
    return pinterestErrorResponse(
      error,
      "Failed to change Pinterest sync",
      LOG_SOURCE,
      "Could not change Pinterest sync."
    );
  }
}
