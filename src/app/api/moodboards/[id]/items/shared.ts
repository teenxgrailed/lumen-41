import { NextRequest, NextResponse } from "next/server";

import {
  MoodboardItemAccessError,
  MoodboardItemNotFoundError,
} from "@/services/moodboards/moodboard-item-service";
import type { ZodSchema } from "zod";

import { routeErrorResponse } from "@/lib/api/route-error";

/**
 * A board the caller cannot reach answers exactly as `/api/moodboards/[id]`
 * does (403, one message for "missing", "other workspace" and "role too low"),
 * so a guessed id tells nothing. An item id that is not on this board is 404.
 */
export function moodboardItemErrorResponse(
  error: unknown,
  message: string,
  source: string,
  publicMessage: string
) {
  if (error instanceof MoodboardItemAccessError) {
    return NextResponse.json(
      { error: "Moodboard access denied" },
      { status: 403 }
    );
  }
  if (error instanceof MoodboardItemNotFoundError) {
    return NextResponse.json(
      { error: "Moodboard item not found" },
      { status: 404 }
    );
  }
  return routeErrorResponse(error, message, source, publicMessage);
}

export async function parseItemBody<T>(
  request: NextRequest,
  schema: ZodSchema<T>
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
    };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid moodboard item", issues: parsed.error.issues },
        { status: 400 }
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
