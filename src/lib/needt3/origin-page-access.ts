import { NextResponse } from "next/server";

import { resolvePageAccess } from "@/lib/auth/page-auth";

type Auth = Parameters<typeof resolvePageAccess>[0];

/**
 * A task may only name a page the caller can read as its origin: otherwise the
 * link would put another person's page id (and, in the origin chip, a way to
 * probe for it) on the caller's task. Null when the page is fine.
 */
export async function originPageRefusal(
  auth: Auth,
  pageId: string
): Promise<NextResponse | null> {
  const access = await resolvePageAccess(auth, pageId);
  return access
    ? null
    : NextResponse.json(
        { error: "Origin page not found or not readable" },
        { status: 400 }
      );
}
