import { NextRequest, NextResponse } from "next/server";

import {
  REAUTH_CHALLENGE_COOKIE,
  beginOAuthReauthentication,
} from "@/services/account/account-reauthentication";
import { z } from "zod";

import { authenticateAccountRequest } from "@/lib/auth/account-request-auth";
import {
  SIGN_IN_PROVIDER_IDS,
  type SignInProviderId,
} from "@/lib/auth/sign-in-provider-ids";

const requestSchema = z.object({
  provider: z.enum(
    SIGN_IN_PROVIDER_IDS as [SignInProviderId, ...SignInProviderId[]]
  ),
});

export async function POST(request: NextRequest) {
  const auth = await authenticateAccountRequest(request);
  if (auth.response) return auth.response;
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }
  try {
    const challenge = await beginOAuthReauthentication(
      auth.user.id,
      auth.sessionHash,
      parsed.data.provider
    );
    const response = NextResponse.json({ ready: true });
    response.cookies.set(REAUTH_CHALLENGE_COOKIE, challenge, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/account/reauth/oauth",
      maxAge: 15 * 60,
    });
    return response;
  } catch (error) {
    if (
      error instanceof Error &&
      ["UNSUPPORTED_REAUTH_PROVIDER", "REAUTH_PROVIDER_NOT_CONNECTED"].includes(
        error.message
      )
    ) {
      return NextResponse.json(
        { error: "Provider is not connected" },
        { status: 409 }
      );
    }
    throw error;
  }
}
