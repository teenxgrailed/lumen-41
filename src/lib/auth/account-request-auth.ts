import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

import { createHash } from "node:crypto";

import { authSecret } from "@/lib/auth/auth-secret";
import { getEmailVerificationStatus } from "@/lib/auth/email-verification-access";
import { sessionStateAllows } from "@/lib/auth/session-version";
import { prisma } from "@/lib/prisma";

export async function authenticateAccountRequest(request: NextRequest): Promise<
  | {
      user: { id: string; email: string | null; isActive: boolean };
      sessionHash: string;
      response?: undefined;
    }
  | { response: NextResponse; user?: undefined }
> {
  const secret = authSecret();
  const [token, rawToken] = await Promise.all([
    getToken({ req: request, secret }),
    getToken({ req: request, secret, raw: true }),
  ]);
  if (!token?.sub || !rawToken) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const user = await prisma.user.findUnique({
    where: { id: token.sub },
    select: { id: true, email: true, isActive: true, sessionVersion: true },
  });
  if (!user || !sessionStateAllows(user, token)) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const verification = await getEmailVerificationStatus(user.id);
  if (verification.required && !verification.verified) {
    return {
      response: NextResponse.json(
        {
          error: "Confirm your email to continue",
          code: "EMAIL_VERIFICATION_REQUIRED",
        },
        { status: 403 }
      ),
    };
  }
  return {
    user: { id: user.id, email: user.email, isActive: user.isActive },
    sessionHash: createHash("sha256").update(rawToken).digest("hex"),
  };
}
