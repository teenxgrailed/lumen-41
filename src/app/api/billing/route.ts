import { NextRequest, NextResponse } from "next/server";

import { getBillingSummary } from "@/services/billing/billing-summary";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "BillingAPI";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;
    return NextResponse.json(await getBillingSummary(auth.userId));
  } catch (error) {
    logger.error(
      "Failed to load billing summary",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to load billing summary" },
      { status: 500 }
    );
  }
}
