import { NextRequest, NextResponse } from "next/server";

import {
  CHATGPT_PLAN_MANAGE_USAGE_URL,
  chatGptPlanAvailable,
} from "@/services/ai/chatgpt-plan/config";
import {
  hasPlanScope,
  revokeChatGptPlanSession,
} from "@/services/ai/chatgpt-plan/oauth";
import { decryptSecret } from "@/services/ai/encryption";
import { AIProvider } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ai-chatgpt-plan";

const notFound = () =>
  NextResponse.json({ error: "Not found" }, { status: 404 });

const where = (userId: string) => ({
  userId_provider: { userId, provider: AIProvider.CHATGPT_PLAN },
});

/** Connection status. 404 unless the flag is on and the client id is set. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  if (!(await chatGptPlanAvailable(auth.userId))) return notFound();

  const connection = await prisma.aIOAuthConnection.findUnique({
    where: where(auth.userId),
  });
  return NextResponse.json({
    available: true,
    connected: Boolean(connection),
    account: connection?.accountLabel ?? null,
    planUsageEnabled: connection ? hasPlanScope(connection.scope) : false,
    expiresAt: connection?.expiresAt?.toISOString() ?? null,
    manageUsageUrl: CHATGPT_PLAN_MANAGE_USAGE_URL,
  });
}

/**
 * Disconnect: end the session at OpenAI, then delete the stored tokens either
 * way. `remoteRevoked: false` means OpenAI did not confirm; the person can
 * disconnect the app in ChatGPT Settings.
 */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const config = await chatGptPlanAvailable(auth.userId);
  if (!config) return notFound();

  const connection = await prisma.aIOAuthConnection.findUnique({
    where: where(auth.userId),
  });
  let remoteRevoked = true;
  const refreshToken = decryptSecret(connection?.encryptedRefreshToken);
  if (connection && refreshToken) {
    remoteRevoked = await revokeChatGptPlanSession(config, refreshToken);
  }
  await prisma.aIOAuthConnection.deleteMany({
    where: { userId: auth.userId, provider: AIProvider.CHATGPT_PLAN },
  });
  return NextResponse.json({ connected: false, remoteRevoked });
}
