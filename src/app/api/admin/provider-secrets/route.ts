import { NextRequest, NextResponse } from "next/server";

import { backfillProviderSecrets } from "@/services/security/provider-secrets-backfill";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "ProviderSecretsAdminAPI";

const bodySchema = z
  .object({ direction: z.enum(["encrypt", "decrypt"]).default("encrypt") })
  .default({});

/**
 * Re-runs the provider-secrets backfill on demand. The worker already runs
 * the encrypt pass at every start; this is for running it without a restart,
 * and for the `decrypt` pass that must precede a rollback to a release that
 * stores provider tokens as plaintext. Returns counts only, never values.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'direction must be "encrypt" or "decrypt"' },
      { status: 400 }
    );
  }

  try {
    const result = await backfillProviderSecrets({
      direction: parsed.data.direction,
    });
    return NextResponse.json(result);
  } catch (error) {
    await logger.error(
      "Provider secrets backfill failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
  }
}
