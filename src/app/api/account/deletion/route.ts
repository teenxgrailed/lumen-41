import { NextRequest, NextResponse } from "next/server";

import {
  cancelAccountDeletion,
  scheduleAccountDeletion,
} from "@/services/account/account-deletion";

import { authenticateAccountRequest } from "@/lib/auth/account-request-auth";
import { enqueueAccountDeletion, isQueueConfigured } from "@/lib/queue/enqueue";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  const auth = await authenticateAccountRequest(request);
  if (auth.response) return auth.response;
  const limited = await enforceRateLimits(
    [
      ipRule(request, "account-deletion:ip", 10, 60 * 60),
      accountRule(auth.user.id, "account-deletion:user", 3, 24 * 60 * 60),
    ],
    { route: request.nextUrl.pathname }
  );
  if (limited) return limited;
  if (!isQueueConfigured()) {
    return NextResponse.json(
      { error: "Account deletion is temporarily unavailable" },
      { status: 503 }
    );
  }
  try {
    const deletion = await scheduleAccountDeletion(
      auth.user.id,
      auth.sessionHash
    );
    const job = await enqueueAccountDeletion(
      deletion.id,
      deletion.scheduledFor
    ).catch(() => null);
    if (!job) {
      await cancelAccountDeletion(auth.user.id);
      return NextResponse.json(
        { error: "Account deletion is temporarily unavailable" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { status: deletion.status, scheduledFor: deletion.scheduledFor },
      { status: 202 }
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "RECENT_AUTHENTICATION_REQUIRED"
    ) {
      return NextResponse.json(
        { error: "Recent authentication required", code: error.message },
        { status: 403 }
      );
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateAccountRequest(request);
  if (auth.response) return auth.response;
  try {
    await cancelAccountDeletion(auth.user.id);
    return NextResponse.json({ canceled: true });
  } catch (error) {
    if (error instanceof Error && error.message === "DELETION_NOT_SCHEDULED") {
      return NextResponse.json(
        { error: "No deletion is scheduled" },
        { status: 409 }
      );
    }
    throw error;
  }
}
