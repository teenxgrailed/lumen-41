import { NextRequest, NextResponse } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { SubscriptionPlan, WorkspaceRole } from "@prisma/client";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { getPlan } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { parseQuickAdd } from "@/lib/quick-add";

const LOG_SOURCE = "QuickAddParseAPI";

const bodySchema = z.object({
  text: z.string().min(1).max(500),
  /** IANA zone; the person's own (Settings) when omitted. */
  timeZone: z.string().min(1).max(64).optional(),
});

function validZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * POST /api/quick-add/parse { text, timeZone? }
 *   -> { title, start?, deadline?, estimatedMinutes?, priorityLevel?, project?, tokens }
 * One quick-add parser for every surface (extension, island, bots, scripts):
 * dates and times via chrono-node in nine languages, plus `2h`, `!high` and
 * `#project`. Nothing is saved. Session or bearer token; Pro.
 */
export async function POST(request: NextRequest) {
  const bearer = request.headers
    .get("authorization")
    ?.toLowerCase()
    .startsWith("bearer ");
  const auth = bearer
    ? await authenticateConnectorRequest(request, WorkspaceRole.VIEWER)
    : await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth && auth.response) return auth.response;
  const userId = auth.userId as string;

  if ((await getPlan(userId)) === SubscriptionPlan.FREE) {
    return NextResponse.json(
      { error: "Quick-add parsing is part of Pro", code: "UPGRADE_REQUIRED" },
      { status: 403 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "text is required (at most 500 characters)" },
      { status: 400 }
    );
  }
  let timeZone = parsed.data.timeZone;
  if (timeZone && !validZone(timeZone)) {
    return NextResponse.json({ error: "Unknown timeZone" }, { status: 400 });
  }
  if (!timeZone) {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { timeZone: true },
    });
    timeZone =
      settings?.timeZone && validZone(settings.timeZone)
        ? settings.timeZone
        : "UTC";
  }
  return NextResponse.json({
    ...parseQuickAdd(parsed.data.text, { now: newDate(), timeZone }),
    timeZone,
  });
}
