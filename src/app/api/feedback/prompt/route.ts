import { NextRequest, NextResponse } from "next/server";

import {
  FEEDBACK_PLATFORMS,
  type FeedbackPlatform,
} from "@/services/feedback/eligibility";
import { offerFeedbackPrompt } from "@/services/feedback/feedback-service";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "FeedbackPromptAPI";

/**
 * What to ask this person now: `{ prompt: { id, kind } }`, or `{ prompt:
 * null }` for nothing. Asking records the prompt as shown, so call it only
 * when the popup is about to appear. `platform` (web, ios, mac, desktop) and
 * `appVersion` are stored with the answer.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth && auth.response) return auth.response;
  try {
    const params = request.nextUrl.searchParams;
    const asked = params.get("platform");
    const platform = FEEDBACK_PLATFORMS.includes(asked as FeedbackPlatform)
      ? (asked as FeedbackPlatform)
      : "web";
    const appVersion = (params.get("appVersion") ?? "").trim().slice(0, 32);
    const prompt = await offerFeedbackPrompt(auth.userId, {
      platform,
      appVersion: appVersion || null,
    });
    return NextResponse.json({ prompt });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to offer a feedback prompt",
      LOG_SOURCE,
      "Could not load the prompt."
    );
  }
}
