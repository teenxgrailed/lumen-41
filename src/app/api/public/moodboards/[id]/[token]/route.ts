import { NextRequest, NextResponse } from "next/server";

import { getPublicMoodboard } from "@/services/moodboards/moodboard-service";

type RouteContext = { params: Promise<{ id: string; token: string }> };

export const dynamic = "force-dynamic";

/**
 * A moodboard shared with "Anyone with the link": read-only, no sign-in. The
 * token is the secret half of the address; a board with link sharing off, in
 * Trash or archived answers 404 exactly like a wrong token.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id, token } = await params;
  const moodboard = await getPublicMoodboard(id, token);
  if (!moodboard) {
    return NextResponse.json(
      { error: "Moodboard not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(
    { moodboard },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
