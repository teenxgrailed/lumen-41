import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";

import { adminActorId } from "@/services/admin/audit";
import {
  BroadcastError,
  cancelBroadcast,
  scheduleBroadcast,
  sendTest,
} from "@/services/email-broadcasts/service";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";
import { authSecret } from "@/lib/auth/auth-secret";
import { newDate } from "@/lib/date-utils";

const LOG_SOURCE = "AdminBroadcastActionAPI";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("test") }),
  z.object({
    action: z.literal("schedule"),
    at: z.string().datetime(),
    confirmCount: z.number().int().nonnegative().optional(),
  }),
  z.object({ action: z.literal("cancel") }),
]);

/**
 * POST /api/admin/email/broadcasts/:id/actions
 * Body: `{ action: "test" }`, `{ action: "schedule", at, confirmCount? }` or
 * `{ action: "cancel" }`. The safeguards (a test after the last edit, 15
 * minutes ahead, within 30 days, typed count for "all") live in the service.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const actorId = await adminActorId(request);
    if (!actorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "That action is not valid." },
        { status: 400 }
      );
    }
    const { id } = await params;
    const actor = { id: actorId, kind: "admin" as const };
    if (parsed.data.action === "test") {
      const token = await getToken({ req: request, secret: authSecret() });
      const email = typeof token?.email === "string" ? token.email : null;
      if (!email) {
        return NextResponse.json(
          { error: "Your session has no email address." },
          { status: 409 }
        );
      }
      return NextResponse.json(await sendTest(id, email));
    }
    if (parsed.data.action === "schedule") {
      const broadcast = await scheduleBroadcast(
        actor,
        id,
        new Date(parsed.data.at),
        parsed.data.confirmCount ?? null,
        newDate()
      );
      return NextResponse.json({ broadcast });
    }
    return NextResponse.json({
      broadcast: await cancelBroadcast(actor, id),
    });
  } catch (error) {
    if (error instanceof BroadcastError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    return routeErrorResponse(
      error,
      "Broadcast action failed",
      LOG_SOURCE,
      "The action could not be completed."
    );
  }
}
