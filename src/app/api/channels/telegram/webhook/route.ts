import { NextRequest, NextResponse } from "next/server";

import { processWebhook } from "@/services/channels";
import { getTelegramAdapter } from "@/services/channels/telegram/config";

/**
 * POST /api/channels/telegram/webhook. Public on purpose: Telegram has no
 * session. The request is trusted only when it carries the configured
 * `X-Telegram-Bot-Api-Secret-Token`; without the bot secrets the route answers
 * 404 and does nothing.
 */
export async function POST(request: NextRequest) {
  const adapter = getTelegramAdapter();
  if (!adapter) return new NextResponse("Not found", { status: 404 });
  const { status, body } = await processWebhook(adapter, request);
  return NextResponse.json(body, { status });
}
