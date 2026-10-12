import { NextRequest, NextResponse } from "next/server";

import {
  MOODBOARD_IMAGE_MAX_BYTES,
  assertCanWriteMoodboard,
  createMoodboardImage,
} from "@/services/moodboards/moodboard-item-service";

import { authenticateRequest } from "@/lib/auth/api-auth";

import {
  FORM_OVERHEAD,
  moodboardItemErrorResponse,
  readCapped,
} from "../shared";

const LOG_SOURCE = "MoodboardItemUploadAPI";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * Add a picture: multipart `file` (JPEG, PNG, WebP or GIF, up to 1.5 MB; the
 * type is read from the bytes), optional `title`, `ratio` (height / width) and
 * `position`. The picture and its tile are written together; the tile's `url`
 * is `/api/moodboards/:id/assets/:assetId`.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    // Who may write is settled before a byte of the body is read.
    await assertCanWriteMoodboard(auth, id);
  } catch (error) {
    return moodboardItemErrorResponse(
      error,
      "Failed to upload Moodboard picture",
      LOG_SOURCE,
      "Could not add the picture."
    );
  }
  // The cap is enforced on the bytes as they arrive (a missing or lying
  // Content-Length does not skip it); the stream is cancelled at the limit.
  const body = await readCapped(
    request,
    MOODBOARD_IMAGE_MAX_BYTES + FORM_OVERHEAD
  );
  if (body === "too_large") {
    return NextResponse.json(
      { error: "Pictures must be 1.5 MB or smaller" },
      { status: 413 }
    );
  }
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(body), {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a picture" }, { status: 400 });
  }
  const text = (key: string) => {
    const v = form.get(key);
    return typeof v === "string" && v.trim() ? v : undefined;
  };
  const ratio = Number(text("ratio"));
  const position = Number(text("position"));
  try {
    const item = await createMoodboardImage(auth, id, {
      bytes: Buffer.from(await file.arrayBuffer()),
      name: file.name,
      title: text("title") ?? null,
      ratio: text("ratio") !== undefined ? ratio : null,
      position:
        text("position") !== undefined && Number.isFinite(position)
          ? position
          : undefined,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return moodboardItemErrorResponse(
      error,
      "Failed to upload Moodboard picture",
      LOG_SOURCE,
      "Could not add the picture."
    );
  }
}
