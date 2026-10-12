import { NextResponse } from "next/server";

import { SubscriptionPlan } from "@prisma/client";

import { proStyleChanges } from "@/components/needt3/docs/pro-style";

import { getPlan } from "@/lib/entitlements";

type StyleField = Record<string, unknown> | null | undefined;

/**
 * The refusal for a page write that sets a Pro-only style value on a free
 * plan, or `null` when the write may go ahead. Same shape and status as the
 * other plan gates (`UPGRADE_REQUIRED`, 403). The plan is read only when the
 * write actually moves a Pro key, so ordinary style edits cost no query.
 */
export async function proStyleRefusal(
  userId: string,
  before: StyleField,
  after: StyleField
): Promise<NextResponse | null> {
  if (after === undefined) return null;
  const keys = proStyleChanges(before, after);
  if (keys.length === 0) return null;
  const plan = await getPlan(userId);
  if (plan !== SubscriptionPlan.FREE) return null;
  return NextResponse.json(
    { error: "UPGRADE_REQUIRED", plan, keys },
    { status: 403 }
  );
}
