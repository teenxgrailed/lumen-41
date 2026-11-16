import { NextResponse } from "next/server";

import { z } from "zod";

import { isFeatureEnabled } from "@/lib/feature-flags";
import { FIRST_REPLAN_ONBOARDING } from "@/lib/feature-flags-keys";
import { logger } from "@/lib/logger";

import { seedFirstReplanDemo } from "./first-replan-demo";
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

/** Whether the first-replan demo is on for this account; never throws. */
async function demoEnabled(userId: string): Promise<boolean> {
  try {
    return Boolean(await isFeatureEnabled(FIRST_REPLAN_ONBOARDING, userId));
  } catch {
    return false;
  }
}

/**
 * The first-replan demo rides on a freshly created sample day, for accounts
 * the `first_replan_onboarding` flag is on for. It never fails the sample day.
 */
async function seedDemoWhenOn(
  input: { userId: string; workspaceId: string },
  timeZone: string | undefined
) {
  try {
    await seedFirstReplanDemo({
      userId: input.userId,
      workspaceId: input.workspaceId,
      timeZone,
    });
  } catch (error) {
    logger.warn(
      "Could not add the first-replan demo",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
  }
}

/**
 * The first-replan demo for an account that finished `/start` (no sample day
 * there): seeded when `first_replan_onboarding` is on for the person, once
 * (`seedFirstReplanDemo` checks), after the week is placed so the commit's
 * scheduler run cannot move the demo task. Never throws.
 */
export async function seedFirstReplanDemoAfterStart(input: {
  userId: string;
  workspaceId: string;
  timeZone?: string;
}): Promise<void> {
  if (!(await demoEnabled(input.userId))) return;
  await seedDemoWhenOn(input, input.timeZone);
}

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
    const demoOn = await demoEnabled(input.userId);
    const result = await seedSampleData({
      userId: input.userId,
      workspaceId: input.workspaceId,
      uses: parsed.data.uses,
      timeZone: parsed.data.timeZone,
      skipOverdue: demoOn,
    });
    if (result.created && demoOn) {
      await seedDemoWhenOn(input, parsed.data.timeZone);
    }
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
