import NextAuth from "next-auth";
import { NextRequest } from "next/server";

import { getAuthOptions } from "@/lib/auth/auth-options";
import { classifyCredentialAttempt } from "@/lib/auth/credential-attempt";
import {
  accountRule,
  clearCredentialFailures,
  enforceCredentialLock,
  enforceRateLimits,
  ipRule,
  recordCredentialFailure,
} from "@/lib/security/rate-limit";

declare module "next-auth" {
  interface Session {
    expiresAt?: number;
    user?: {
      id?: string;
      name?: string;
      email?: string;
      image?: string;
      role?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    expiresAt?: number;
    role?: string;
    /** User.sessionVersion this token was issued under. */
    sessionVersion?: number;
    /** Epoch ms of the last database check of sessionVersion. */
    sessionVersionCheckedAt?: number;
  }
}

interface AuthRouteContext {
  params: Promise<{
    nextauth: string[];
  }>;
}

type AuthHandler = ReturnType<typeof NextAuth>;

let handlerPromise: Promise<AuthHandler> | undefined;

async function getHandler(): Promise<AuthHandler> {
  handlerPromise ??= getAuthOptions().then((options) => NextAuth(options));

  try {
    return await handlerPromise;
  } catch (error) {
    handlerPromise = undefined;
    throw error;
  }
}

export async function GET(request: NextRequest, context: AuthRouteContext) {
  const handler = await getHandler();
  return handler(request, context);
}

export async function POST(request: NextRequest, context: AuthRouteContext) {
  const handler = await getHandler();
  if (request.nextUrl.pathname.endsWith("/callback/credentials")) {
    const form = await request.clone().formData();
    const email = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    const locked = await enforceCredentialLock(email);
    if (locked) return locked;
    const limited = await enforceRateLimits(
      [
        ipRule(request, "credentials:ip", 20, 15 * 60),
        accountRule(email || "missing", "credentials:account", 5, 15 * 60),
      ],
      { route: request.nextUrl.pathname }
    );
    if (limited) return limited;
    const response = await handler(request, context);
    const location = response.headers.get("location") ?? "";
    const body = response.headers
      .get("content-type")
      ?.includes("application/json")
      ? await response.clone().text()
      : "";
    const verdict = classifyCredentialAttempt(response.status, location, body);
    if (verdict === "failed") {
      await recordCredentialFailure(email);
    } else if (verdict === "succeeded") {
      await clearCredentialFailures(email);
    }
    return response;
  }
  return handler(request, context);
}
