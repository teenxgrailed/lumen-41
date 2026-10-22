import { NextRequest, NextResponse } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { SubscriptionPlan, WorkspaceRole } from "@prisma/client";
import { z } from "zod";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { getPlan } from "@/lib/entitlements";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { ENERGY_CURVE } from "@/lib/feature-flags-keys";
import {
  CHRONOTYPES,
  chronotypeCurve,
  isChronotype,
} from "@/lib/needt3/chronotype";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "EnergyProfileAPI";

const bodySchema = z.object({ chronotype: z.enum(CHRONOTYPES) });

/**
 * Session (the web app) or bearer token (agents, scripts), then the
 * `energy_curve` flag (404 while off) and the plan (403 on Free).
 */
async function authenticate(
  request: NextRequest,
  role: WorkspaceRole
): Promise<{ userId: string } | { response: NextResponse }> {
  const bearer = request.headers
    .get("authorization")
    ?.toLowerCase()
    .startsWith("bearer ");
  const auth = bearer
    ? await authenticateConnectorRequest(request, role)
    : await authenticateRequest(request, LOG_SOURCE, { requiredRole: role });
  if ("response" in auth && auth.response) return { response: auth.response };
  const userId = auth.userId as string;
  if (!(await isFeatureEnabled(ENERGY_CURVE, userId))) {
    return {
      response: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }
  if ((await getPlan(userId)) === SubscriptionPlan.FREE) {
    return {
      response: NextResponse.json(
        { error: "The energy curve is part of Pro", code: "UPGRADE_REQUIRED" },
        { status: 403 }
      ),
    };
  }
  return { userId };
}

function shape(chronotype: string | null) {
  return isChronotype(chronotype)
    ? { chronotype, curve: chronotypeCurve(chronotype) }
    : { chronotype: null, curve: [] };
}

/**
 * GET /api/energy/profile -> { chronotype, curve: [{ start, end, energy }] }
 * The curve the scheduler uses when no energy hours are set by hand.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request, WorkspaceRole.VIEWER);
  if ("response" in auth) return auth.response;
  try {
    const profile = await prisma.energyProfile.findUnique({
      where: { userId: auth.userId },
      select: { chronotype: true },
    });
    return NextResponse.json(shape(profile?.chronotype ?? null));
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to read energy profile",
      LOG_SOURCE
    );
  }
}

/** PUT /api/energy/profile { chronotype: "lark" | "neutral" | "owl" } */
export async function PUT(request: NextRequest) {
  const auth = await authenticate(request, WorkspaceRole.EDITOR);
  if ("response" in auth) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `chronotype must be one of ${CHRONOTYPES.join(", ")}` },
      { status: 400 }
    );
  }
  try {
    const profile = await prisma.energyProfile.upsert({
      where: { userId: auth.userId },
      update: { chronotype: parsed.data.chronotype },
      create: { userId: auth.userId, chronotype: parsed.data.chronotype },
      select: { chronotype: true },
    });
    return NextResponse.json(shape(profile.chronotype));
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to save energy profile",
      LOG_SOURCE
    );
  }
}

/** DELETE /api/energy/profile: back to the plain morning default. */
export async function DELETE(request: NextRequest) {
  const auth = await authenticate(request, WorkspaceRole.EDITOR);
  if ("response" in auth) return auth.response;
  try {
    await prisma.energyProfile.deleteMany({ where: { userId: auth.userId } });
    return NextResponse.json(shape(null));
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to clear energy profile",
      LOG_SOURCE
    );
  }
}
