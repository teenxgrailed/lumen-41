import { NextRequest, NextResponse } from "next/server";

import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { publicRequestUrl } from "@/lib/public-url";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

const LOG_SOURCE = "WaitlistAPI";

/**
 * POST /api/waitlist — public, no auth. The landing page at needt.app is a
 * separate static site, so this is called cross-origin. An address goes
 * straight onto the list (no confirmation email), and the answer is the same
 * `{ ok: true }` whether it was new or already there, so the endpoint cannot
 * be used to learn who signed up.
 */

const LANDING_ORIGINS = new Set(["https://needt.app", "https://www.needt.app"]);
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const MAX_BODY_BYTES = 2_048;

const waitlistSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  /** Referral code from the landing's `?ref=`; stored as `referredBy`. */
  ref: z.string().trim().max(64).optional(),
  /** Where the sign-up came from. Accepted for the contract; not stored. */
  source: z.string().trim().max(64).optional(),
  /** Honeypot. People leave it empty; a filled one gets a quiet success. */
  company: z.string().max(256).optional(),
});

function allowedOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (LANDING_ORIGINS.has(origin)) return origin;
  if (process.env.NODE_ENV !== "production" && DEV_ORIGIN.test(origin)) {
    return origin;
  }
  if (origin === publicRequestUrl(request).origin) return origin;
  return null;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };
  if (!origin) return headers;
  return {
    ...headers,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return NextResponse.json(body, { status, headers: corsHeaders(origin) });
}

export function OPTIONS(request: NextRequest) {
  const origin = allowedOrigin(request);
  if (!origin) {
    return new NextResponse(null, { status: 403, headers: corsHeaders(null) });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

function isUniqueViolationOn(error: unknown, field: string) {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.includes(field)
    : String(target ?? "").includes(field);
}

async function addToWaitlist(email: string, ref: string | null) {
  // A referral code collision is astronomically unlikely, but a retry is
  // cheaper than an argument about it.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await prisma.waitlist.create({
        data: {
          email,
          referralCode: randomBytes(5).toString("hex"),
          referredBy: ref,
        },
      });
      return true;
    } catch (error) {
      if (isUniqueViolationOn(error, "email")) return false;
      if (isUniqueViolationOn(error, "referralCode")) continue;
      throw error;
    }
  }
  throw new Error("Could not allocate a waitlist referral code");
}

export async function POST(request: NextRequest) {
  const hasOrigin = request.headers.has("origin");
  const origin = allowedOrigin(request);
  // A browser on another site is refused outright; curl and servers send no
  // Origin and are left to the rate limits.
  if (hasOrigin && !origin) {
    return json({ error: "origin_not_allowed" }, 403, null);
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return json({ error: "invalid_request" }, 413, origin);
  }
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json({ error: "invalid_request" }, 400, origin);
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return json({ error: "invalid_request" }, 413, origin);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_request" }, 400, origin);
  }

  const parsed = waitlistSchema.safeParse(body);
  if (!parsed.success) {
    const emailIssue = parsed.error.issues.some(
      (issue) => issue.path[0] === "email"
    );
    return json(
      { error: emailIssue ? "invalid_email" : "invalid_request" },
      400,
      origin
    );
  }

  const { email, ref, company } = parsed.data;
  if (company && company.trim() !== "") {
    return json({ ok: true }, 200, origin);
  }

  const limited = await enforceRateLimits(
    [
      ipRule(request, "waitlist:ip", 10, 60 * 60),
      accountRule(email, "waitlist:email", 5, 60 * 60),
    ],
    { route: request.nextUrl.pathname }
  );
  if (limited) {
    for (const [key, value] of Object.entries(corsHeaders(origin))) {
      limited.headers.set(key, value);
    }
    return limited;
  }

  try {
    const referredBy = ref ? ref : null;
    const created = await addToWaitlist(email, referredBy);
    if (created && referredBy) {
      await prisma.waitlist.updateMany({
        where: { referralCode: referredBy, NOT: { email } },
        data: { referralCount: { increment: 1 } },
      });
    }
    if (created) {
      logger.info(
        "Waitlist entry added",
        { referred: Boolean(referredBy) },
        LOG_SOURCE
      );
    }
    return json({ ok: true }, 200, origin);
  } catch (error) {
    logger.error(
      "Failed to add a waitlist entry",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return json({ error: "unavailable" }, 500, origin);
  }
}
