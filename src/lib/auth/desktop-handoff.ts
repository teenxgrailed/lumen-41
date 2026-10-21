import { NextRequest } from "next/server";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import {
  DESKTOP_CHALLENGE_PATTERN,
  DESKTOP_CODE_PATTERN,
  DESKTOP_HANDOFF_HEADER,
  DESKTOP_VERIFIER_PATTERN,
} from "@/lib/auth/desktop-handoff-shape";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { publicRequestUrl } from "@/lib/public-url";

/**
 * Sign-in for the desktop app (apps/desktop) without a web sign-in page in it.
 *
 * The app opens the system browser on `/auth/desktop?challenge=...`. The person
 * signs in there the normal way (Google included: providers refuse embedded
 * webviews), confirms, and the page asks for a one-time code and hands it to
 * the app through `needt://auth?code=...`. The app trades the code, plus the
 * verifier it kept to itself, for a session cookie in its own webview.
 *
 * It is PKCE: the app generates a random `verifier`, sends only
 * `challenge = base64url(sha256(verifier))` to the browser, and must show the
 * verifier to get the session. So a code taken off the deep link by another
 * program on the machine (any app can register `needt://`) is useless without
 * the verifier, and a code issued to somebody else's challenge is useless to
 * the app. This is not a login bypass: issuing a code needs a valid session
 * and an explicit confirmation click, and nothing here signs anyone in on its
 * own.
 *
 * Codes are random (256 bits), live 60 seconds, work once, are bound to the
 * user, and only their SHA-256 is stored. A code that is presented and fails
 * the verifier check is burned too, so it cannot be guessed against.
 */

export const DESKTOP_CODE_TTL_MS = 60_000;

export {
  DESKTOP_CHALLENGE_PATTERN,
  DESKTOP_CODE_PATTERN,
  DESKTOP_HANDOFF_HEADER,
  DESKTOP_VERIFIER_PATTERN,
};

const STALE_AFTER_MS = 60 * 60 * 1000;

export function hashDesktopCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** The challenge a verifier answers: base64url(sha256(verifier)). */
export function desktopChallengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Stores a hashed one-time code for the user and returns the code itself. */
export async function issueDesktopAuthCode(input: {
  userId: string;
  challenge: string;
}): Promise<string> {
  if (!DESKTOP_CHALLENGE_PATTERN.test(input.challenge)) {
    throw new Error("Invalid challenge");
  }
  const now = newDate();
  const code = randomBytes(32).toString("base64url");
  await prisma.desktopAuthCode.create({
    data: {
      codeHash: hashDesktopCode(code),
      challenge: input.challenge,
      userId: input.userId,
      expiresAt: new Date(now.getTime() + DESKTOP_CODE_TTL_MS),
    },
  });
  // Housekeeping: spent and expired rows are of no use after an hour.
  await prisma.desktopAuthCode
    .deleteMany({
      where: { expiresAt: { lt: new Date(now.getTime() - STALE_AFTER_MS) } },
    })
    .catch(() => undefined);
  return code;
}

/**
 * Trades a code and its verifier for the user it was issued to, once. Null for
 * anything else: unknown, expired, already used, wrong verifier, inactive user.
 */
export async function redeemDesktopAuthCode(input: {
  code: string;
  verifier: string;
}): Promise<{
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
} | null> {
  if (
    !DESKTOP_CODE_PATTERN.test(input.code) ||
    !DESKTOP_VERIFIER_PATTERN.test(input.verifier)
  ) {
    return null;
  }
  const now = newDate();
  const codeHash = hashDesktopCode(input.code);
  const row = await prisma.desktopAuthCode.findUnique({
    where: { codeHash },
    select: { challenge: true, userId: true },
  });
  if (!row) return null;
  // Claim first, check after: whoever claims it, the code is spent.
  const claimed = await prisma.desktopAuthCode.updateMany({
    where: { codeHash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (claimed.count !== 1) return null;
  if (!sameString(desktopChallengeFor(input.verifier), row.challenge)) {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: row.userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      isActive: true,
    },
  });
  if (!user?.isActive) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
  };
}

/**
 * True for a request the app's own pages made: a JSON POST from this very
 * origin that carries the handoff header. A cross-site page cannot set the
 * header without a preflight this server never answers, and cannot forge the
 * Origin header a browser sends.
 */
export function isDesktopHandoffRequest(request: NextRequest): boolean {
  if (request.headers.get(DESKTOP_HANDOFF_HEADER) !== "1") return false;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === publicRequestUrl(request).origin;
}

/** NextAuth's session cookie name for this deployment (mirrors getToken). */
export function sessionCookieName(
  env: NodeJS.ProcessEnv = process.env
): string {
  const secure = env.NEXTAUTH_URL?.startsWith("https://") ?? !!env.VERCEL;
  return `${secure ? "__Secure-" : ""}next-auth.session-token`;
}
