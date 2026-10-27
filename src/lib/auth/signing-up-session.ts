import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

import { authSecret } from "@/lib/auth/auth-secret";
import { isApiSessionCurrent } from "@/lib/auth/session-version";
import { prisma } from "@/lib/prisma";

/**
 * The browser that signed up: the request still carries a live (not revoked)
 * session of the very account `email` names. Anything else, a fresh browser
 * or another device, is not known to have chosen that account's password
 * (see unproven-password.ts). A failed check counts as "not the same".
 */
export async function isSigningUpSession(
  request: NextRequest,
  email: string
): Promise<boolean> {
  try {
    const token = await getToken({ req: request, secret: authSecret() });
    if (!token?.sub || !(await isApiSessionCurrent(token))) return false;
    const owner = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true },
    });
    return owner?.id === token.sub;
  } catch {
    return false;
  }
}
