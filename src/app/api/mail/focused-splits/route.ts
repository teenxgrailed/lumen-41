import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { createMailFocusedSplit, listMailFocusedSplits } from "@/lib/mail-db";

const LOG_SOURCE = "MailFocusedSplitsAPI";

const createFocusedSplitSchema = z.object({
  name: z.string().trim().min(1).max(80),
  senderAddress: z.string().trim().email().max(320),
});

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json(await listMailFocusedSplits(auth.userId));
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to list focused Mail splits",
      LOG_SOURCE,
      "Could not load focused Mail splits."
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = createFocusedSplitSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A name and valid sender address are required." },
      { status: 400 }
    );
  }
  try {
    const split = await createMailFocusedSplit({
      userId: auth.userId,
      ...parsed.data,
    });
    return NextResponse.json(split, { status: 201 });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to create focused Mail split",
      LOG_SOURCE,
      "Could not create focused Mail split."
    );
  }
}
