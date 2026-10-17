import { NextResponse } from "next/server";

import { z } from "zod";

import { logger } from "@/lib/logger";

import { SAMPLE_USES } from "./sample-content";
import {
  clearSampleData,
  sampleStatus,
  seedSampleData,
} from "./sample-service";

/**
 * The three answers of `/api/onboarding/sample` (session) and
 * `/api/connect/onboarding/sample` (token). Authentication stays in the routes.
 */

const LOG_SOURCE = "OnboardingSampleAPI";

const bodySchema = z
  .object({
    /** What the person uses Needt for; the first entry picks the sample. */
    uses: z.array(z.enum(SAMPLE_USES)).max(SAMPLE_USES.length).optional(),
    /** IANA zone the times are written in; defaults to the saved setting. */
    timeZone: z.string().min(1).max(64).optional(),
  })
  .strict();

/** Whether examples are still on the account: `{ present, counts }`. */
export async function sampleStatusResponse(userId: string) {
  return NextResponse.json(await sampleStatus(userId));
}

/**
 * Creates the sample day, once per account. A repeat call answers 200 with
 * `created: false` and changes nothing; so does any account that existed
 * before the feature.
 */
export async function seedSampleResponse(input: {
  userId: string;
  workspaceId: string;
  body: unknown;
}) {
  const parsed = bodySchema.safeParse(input.body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  try {
    const result = await seedSampleData({
      userId: input.userId,
      workspaceId: input.workspaceId,
      uses: parsed.data.uses,
      timeZone: parsed.data.timeZone,
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    logger.error(
      "Could not create the sample day",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Could not create the examples" },
      { status: 500 }
    );
  }
}

/** Removes every example still on the account, and only those. */
export async function clearSampleResponse(userId: string) {
  try {
    return NextResponse.json({ removed: await clearSampleData({ userId }) });
  } catch (error) {
    logger.error(
      "Could not clear the examples",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Could not clear the examples" },
      { status: 500 }
    );
  }
}
