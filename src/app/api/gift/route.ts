import { NextRequest, NextResponse } from "next/server";

import { markGiftSeen, unseenGift } from "@/services/gifts/gifts";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "GiftAPI";

export const runtime = "nodejs";

/** GET /api/gift : the running gift the person has not seen yet, or null. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const gift = await unseenGift(auth.userId);
  return NextResponse.json({
    gift: gift
      ? {
          id: gift.id,
          months: gift.months,
          note: gift.personalNote,
          endsAt: gift.endsAt.toISOString(),
        }
      : null,
  });
}

/** POST /api/gift : `{ id }` marks the gift as seen so the screen shows once. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = z
    .object({ id: z.string().min(1).max(64) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That is not valid." }, { status: 400 });
  }
  const marked = await markGiftSeen(auth.userId, parsed.data.id);
  return NextResponse.json({ ok: marked });
}
