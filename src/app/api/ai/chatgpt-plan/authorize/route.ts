import { NextRequest, NextResponse } from "next/server";

import {
  chatGptPlanAvailable,
  getChatGptPlanRedirectUri,
} from "@/services/ai/chatgpt-plan/config";
import { buildChatGptPlanAuthorizationUrl } from "@/services/ai/chatgpt-plan/oauth";
import { encryptSecret } from "@/services/ai/encryption";
import {
  aiOAuthStateTtlMs,
  createOAuthState,
  createPkceVerifier,
  hashOAuthState,
} from "@/services/ai/oauth";
import { AIProvider } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ai-chatgpt-plan-authorize";

/** Starts Sign in with ChatGPT (PKCE + one-use state). 404 when the feature is off. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const config = await chatGptPlanAvailable(auth.userId);
  if (!config)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const state = createOAuthState();
    const codeVerifier = createPkceVerifier();
    const redirectUri = getChatGptPlanRedirectUri();
    await prisma.$transaction([
      prisma.aIOAuthState.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      }),
      prisma.aIOAuthState.create({
        data: {
          userId: auth.userId,
          provider: AIProvider.CHATGPT_PLAN,
          stateHash: hashOAuthState(state),
          encryptedCodeVerifier: encryptSecret(codeVerifier),
          redirectUri,
          expiresAt: new Date(Date.now() + aiOAuthStateTtlMs),
        },
      }),
    ]);
    return NextResponse.redirect(
      buildChatGptPlanAuthorizationUrl({
        config,
        redirectUri,
        state,
        codeVerifier,
      })
    );
  } catch (error) {
    logger.error(
      "Failed to start ChatGPT plan sign-in",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Could not start ChatGPT sign-in" },
      { status: 500 }
    );
  }
}
