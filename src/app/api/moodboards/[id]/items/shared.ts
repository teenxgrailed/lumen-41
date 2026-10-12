import { NextRequest, NextResponse } from "next/server";

import {
  MOODBOARD_ITEM_LIMIT,
  MoodboardItemAccessError,
  MoodboardItemLimitError,
  MoodboardItemNotFoundError,
  MoodboardItemRequiredFieldError,
  MoodboardOrderError,
  MoodboardTrashedError,
  MoodboardUploadError,
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
  if (error instanceof MoodboardItemLimitError) {
    return NextResponse.json(
      { error: "Moodboard is full", limit: MOODBOARD_ITEM_LIMIT },
      { status: 409 }
    );
  }
  if (error instanceof MoodboardItemRequiredFieldError) {
    return NextResponse.json(
      {
        error: "Invalid moodboard item",
        issues: [{ path: [error.field], message: error.message }],
      },
      { status: 400 }
    );
  }
  if (error instanceof MoodboardOrderError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof MoodboardTrashedError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof MoodboardUploadError) {
    return NextResponse.json(
      { error: error.message },
      {
        status:
          error.code === "TOO_LARGE" || error.code === "STORAGE_FULL"
            ? 413
            : error.code === "BAD_TYPE"
              ? 415
              : error.code === "TOO_MANY"
                ? 409
                : 400,
      }
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

/** Room for the multipart envelope (boundaries, field names, the small fields). */
export const FORM_OVERHEAD = 64 * 1024;

/** The request body, or "too_large" once more than `max` bytes have arrived (the stream is cancelled). */
export async function readCapped(
  request: NextRequest,
  max: number
): Promise<Buffer | "too_large"> {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return "too_large";
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
