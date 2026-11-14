import { NextResponse } from "next/server";

import {
  isProviderConfigured,
  readSignInProviderConfig,
} from "@/lib/auth/sign-in-providers";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "GoogleClientAPI";

export const dynamic = "force-dynamic";

/**
 * The Google OAuth client id for Google One Tap on the sign-in page, or null
 * when Google sign-in is not configured. A client id is public (it is in
 * every Google redirect URL); the secret never leaves the server.
 */
export async function GET() {
  try {
    const config = await readSignInProviderConfig();
    const clientId = isProviderConfigured("google", config)
      ? config.google.clientId
      : null;
    return NextResponse.json({ clientId });
  } catch (error) {
    logger.error(
      "Failed to read the Google client id",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ clientId: null });
  }
}
