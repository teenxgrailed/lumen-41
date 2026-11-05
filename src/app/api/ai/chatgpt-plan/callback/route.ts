import { NextRequest, NextResponse } from "next/server";

import { chatGptPlanAvailable } from "@/services/ai/chatgpt-plan/config";
import {
  exchangeChatGptPlanCode,
  hasPlanScope,
  nonceFromState,
  revokeChatGptPlanSession,
  verifyChatGptIdToken,
} from "@/services/ai/chatgpt-plan/oauth";
import { decryptSecret, encryptSecret } from "@/services/ai/encryption";
import { hashOAuthState } from "@/services/ai/oauth";
import { AIProvider } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ai-chatgpt-plan-callback";

type Result = "connected" | "failed" | "not_granted";

function backToSettings(redirectUri: string, result: Result) {
  const destination = new URL("/settings", redirectUri);
  destination.searchParams.set("ai-chatgpt-plan", result);
  return NextResponse.redirect(destination);
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const config = await chatGptPlanAvailable(auth.userId);
  if (!config)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const state = request.nextUrl.searchParams.get("state");
  if (!state) {
    return NextResponse.json({ error: "Missing OAuth state" }, { status: 400 });
  }
  const oauthState = await prisma.aIOAuthState.findUnique({
    where: { stateHash: hashOAuthState(state) },
  });
  if (
    !oauthState ||
    oauthState.userId !== auth.userId ||
    oauthState.provider !== AIProvider.CHATGPT_PLAN ||
    oauthState.expiresAt <= newDate()
  ) {
    if (oauthState?.userId === auth.userId) {
      await prisma.aIOAuthState.delete({ where: { id: oauthState.id } });
    }
    return NextResponse.json(
      { error: "Invalid or expired OAuth state" },
      { status: 400 }
    );
  }

  // One use: consume before talking to the token endpoint.
  const consumed = await prisma.aIOAuthState.deleteMany({
    where: { id: oauthState.id, userId: auth.userId },
  });
  if (consumed.count !== 1)
    return backToSettings(oauthState.redirectUri, "failed");
  if (request.nextUrl.searchParams.get("error")) {
    return backToSettings(oauthState.redirectUri, "failed");
  }

  const code = request.nextUrl.searchParams.get("code");
  const codeVerifier = decryptSecret(oauthState.encryptedCodeVerifier);
  if (!code || !codeVerifier) {
    return backToSettings(oauthState.redirectUri, "failed");
  }

  try {
    const tokens = await exchangeChatGptPlanCode({
      config,
      code,
      redirectUri: oauthState.redirectUri,
      codeVerifier,
    });
    // An ID token alone does not let Needt use the plan.
    if (!hasPlanScope(tokens.scope)) {
      // Tokens were issued, so end that session before leaving.
      if (tokens.refreshToken) {
        await revokeChatGptPlanSession(config, tokens.refreshToken);
      }
      return backToSettings(oauthState.redirectUri, "not_granted");
    }
    if (!tokens.idToken || !tokens.refreshToken) {
      if (tokens.refreshToken) {
        await revokeChatGptPlanSession(config, tokens.refreshToken);
      }
      return backToSettings(oauthState.redirectUri, "failed");
    }
    let identity: Awaited<ReturnType<typeof verifyChatGptIdToken>>;
    try {
      identity = await verifyChatGptIdToken(tokens.idToken, {
        clientId: config.clientId,
        nonce: nonceFromState(state),
      });
    } catch (error) {
      // A token that fails verification still opened a session at OpenAI.
      await revokeChatGptPlanSession(config, tokens.refreshToken);
      throw error;
    }
    const data = {
      encryptedAccessToken: encryptSecret(tokens.accessToken),
      encryptedRefreshToken: encryptSecret(tokens.refreshToken),
      tokenType: "Bearer",
      scope: tokens.scope,
      expiresAt: tokens.expiresAt,
      accountLabel: identity.email,
    };
    await prisma.aIOAuthConnection.upsert({
      where: {
        userId_provider: {
          userId: auth.userId,
          provider: AIProvider.CHATGPT_PLAN,
        },
      },
      create: {
        userId: auth.userId,
        provider: AIProvider.CHATGPT_PLAN,
        ...data,
      },
      update: data,
    });
    return backToSettings(oauthState.redirectUri, "connected");
  } catch (error) {
    logger.error(
      "Failed to complete ChatGPT plan sign-in",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return backToSettings(oauthState.redirectUri, "failed");
  }
}
