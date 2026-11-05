import { NextRequest, NextResponse } from "next/server";

import { APNS_TOKEN_PATTERN } from "@/services/push/apns";

import {
  IOS_BUNDLE_ID,
  MAC_BUNDLE_ID,
  getApnsConfiguration,
} from "@/lib/apns-config";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "native-push-route";

/**
 * APNs device tokens from the iOS app. The app registers with Apple through
 * the Capacitor push plugin and sends the hex token here; the worker delivers
 * through APNs (services/push/apns.ts). Web push keeps its own route.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  return NextResponse.json({
    configured: getApnsConfiguration().configured,
  });
}

function readToken(value: unknown) {
  return typeof value === "string" && APNS_TOKEN_PATTERN.test(value)
    ? value.toLowerCase()
    : null;
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => ({}))) as {
    token?: unknown;
    platform?: unknown;
    environment?: unknown;
  };
  const token = readToken(body.token);
  // The iOS app, or the Mac app (its own bundle, so its own APNs topic). A
  // Mac build says which APNs environment its token belongs to; iOS learns
  // it when production refuses a sandbox token.
  const platform =
    body.platform === "ios" || body.platform === "macos" ? body.platform : null;
  if (!token || !platform) {
    return NextResponse.json(
      { error: "Invalid device token" },
      { status: 400 }
    );
  }
  const existing = await prisma.nativePushToken.findUnique({
    where: { token },
    select: { userId: true },
  });
  // A token is one app install. Someone else signing in on the same phone
  // takes it over, so pushes follow whoever is signed in there now.
  const movedFromOtherAccount = Boolean(
    existing && existing.userId !== auth.userId
  );
  const saved = await prisma.nativePushToken.upsert({
    where: { token },
    // Touched on every launch, so a token that stops being refreshed can be
    // told apart (pruneStaleNativePushTokens).
    update: { userId: auth.userId, updatedAt: newDate() },
    create: {
      userId: auth.userId,
      token,
      platform,
      bundleId: platform === "macos" ? MAC_BUNDLE_ID : IOS_BUNDLE_ID,
      ...(platform === "macos" && body.environment === "sandbox"
        ? { environment: "sandbox" }
        : {}),
    },
    select: { id: true },
  });
  if (!existing || movedFromOtherAccount) {
    await logger.info(
      "APNs token saved",
      { userId: auth.userId, movedFromOtherAccount },
      LOG_SOURCE
    );
  }
  return NextResponse.json({ id: saved.id }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const token = readToken(request.nextUrl.searchParams.get("token"));
  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }
  await prisma.nativePushToken.deleteMany({
    where: { userId: auth.userId, token },
  });
  return new NextResponse(null, { status: 204 });
}
