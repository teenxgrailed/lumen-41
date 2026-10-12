import { NextResponse } from "next/server";

import { isPublicSignupEnabled } from "@/lib/auth/public-signup";
import { areSignupsOpen } from "@/lib/auth/signups";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "PublicSignupAPI";

export async function GET() {
  try {
    // Sign-up is offered only when the launch flag and the admin switch agree.
    const enabled = (await areSignupsOpen()) && (await isPublicSignupEnabled());
    return NextResponse.json({ enabled });
  } catch (error) {
    logger.error(
      "Failed to check public signup setting",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ enabled: false }, { status: 500 });
  }
}
