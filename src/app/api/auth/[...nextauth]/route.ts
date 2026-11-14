import NextAuth from "next-auth";
import { NextRequest } from "next/server";

import { getAuthOptions } from "@/lib/auth/auth-options";
import { classifyCredentialAttempt } from "@/lib/auth/credential-attempt";
import { credentialsEmail } from "@/lib/auth/credentials-email";
import { ONE_TAP_PROVIDER_ID } from "@/lib/auth/google-one-tap";
import {
  oneTapNonceCookieName,
  unverifiedTokenNonce,
} from "@/lib/auth/google-one-tap-nonce";
import { signInSucceeded } from "@/lib/auth/sign-in-outcome";
import { newDate } from "@/lib/date-utils";
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
    /** True briefly after a One Tap sign-in created the account. */
    newAccount?: boolean;
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
    /** User.sandboxKind at sign-in; the middleware locks sandbox sessions. */
    sandboxKind?: string;
    /** User.sessionVersion this token was issued under. */
    sessionVersion?: number;
    /** Epoch ms of the last database check of sessionVersion. */
    sessionVersionCheckedAt?: number;
    /** Epoch ms a One Tap sign-in created this account (see session callback). */
    freshAccountAt?: number;
  }
}

interface AuthRouteContext {
  params: Promise<{
    nextauth: string[];
  }>;
}

type AuthHandler = ReturnType<typeof NextAuth>;

let handlerPromise: Promise<AuthHandler> | undefined;
let handlerBuiltAt = 0;

/* The handler is rebuilt every ten minutes so a sign-in provider configured in
   System Settings appears without a restart, and Apple's signed client secret
   (sign-in-providers.ts) never outlives its refresh. */
const HANDLER_MAX_AGE_MS = 10 * 60 * 1000;

async function getHandler(): Promise<AuthHandler> {
  const now = newDate().getTime();
  if (!handlerPromise || now - handlerBuiltAt > HANDLER_MAX_AGE_MS) {
    handlerBuiltAt = now;
    handlerPromise = getAuthOptions().then((options) => NextAuth(options));
  }

  try {
    return await handlerPromise;
  } catch (error) {
    handlerPromise = undefined;
    throw error;
  }
}

/** The `credential` field of a One Tap callback, read the way NextAuth reads it. */
async function oneTapCredential(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  const clone = request.clone();
  if (type.includes("application/json")) {
    return ((await clone.json().catch(() => null)) as { credential?: unknown })
      ?.credential;
  }
  if (type.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(await clone.text()))
      .credential;
  }
  return undefined;
}

export async function GET(request: NextRequest, context: AuthRouteContext) {
  const handler = await getHandler();
  return handler(request, context);
}

export async function POST(request: NextRequest, context: AuthRouteContext) {
  const handler = await getHandler();
  if (request.nextUrl.pathname.endsWith("/callback/credentials")) {
    const email = await credentialsEmail(request);
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
  if (request.nextUrl.pathname.endsWith(`/callback/${ONE_TAP_PROVIDER_ID}`)) {
    /* Each attempt verifies a JWT and queries the account tables. */
    const limited = await enforceRateLimits(
      [ipRule(request, "onetap:ip", 20, 15 * 60)],
      { route: request.nextUrl.pathname }
    );
    if (limited) return limited;
    const nonce = unverifiedTokenNonce(await oneTapCredential(request));
    const response = await handler(request, context);
    /* The nonce is single use: a success clears its cookie. A refusal keeps
       it, so the age confirmation can retry with the same token. */
    const succeeded = signInSucceeded({
      status: response.status,
      location: response.headers.get("location"),
      body: response.headers.get("content-type")?.includes("application/json")
        ? await response.clone().text()
        : null,
    });
    if (succeeded && nonce) {
      response.headers.append(
        "set-cookie",
        `${oneTapNonceCookieName(nonce)}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
      );
    }
    return response;
  }
  return handler(request, context);
}
