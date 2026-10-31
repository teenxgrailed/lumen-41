import { NextRequest, NextResponse } from "next/server";

import { adminActorId, recordAdminAudit } from "@/services/admin/audit";
import { z } from "zod";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import {
  clearStudent,
  markStudentManually,
} from "@/lib/students/student-service";

const LOG_SOURCE = "AdminStudentsAPI";

export const runtime = "nodejs";

/**
 * GET /api/admin/students: who has the student price, and the lapsed ones
 * whose subscription still renews. Creem's API cannot take a discount off a
 * running subscription, so each `needsAction` row is support's to-do
 * (docs/students.md, "When the yearly check fails").
 */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const rows = await prisma.user.findMany({
      where: { studentVerifiedAt: { not: null } },
      select: {
        id: true,
        email: true,
        studentEmail: true,
        studentSource: true,
        studentVerifiedAt: true,
        studentRecheckSentAt: true,
        studentLapsedAt: true,
        studentDiscountCode: true,
        subscription: {
          select: {
            plan: true,
            status: true,
            interval: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            creemSubscriptionId: true,
            discountApplied: true,
          },
        },
      },
      orderBy: { studentVerifiedAt: "desc" },
      take: 500,
    });
    return NextResponse.json({
      students: rows.map(({ studentDiscountCode, ...row }) => ({
        ...row,
        hasPersonalCode: Boolean(studentDiscountCode),
        needsAction: Boolean(
          row.studentLapsedAt &&
            row.subscription?.status === "ACTIVE" &&
            row.subscription.plan === "PRO" &&
            !row.subscription.cancelAtPeriodEnd
        ),
      })),
    });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Could not list students",
      LOG_SOURCE,
      "Could not list students."
    );
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("mark"),
    userId: z.string().min(1),
    /** The address support checked, if the person has one. */
    studentEmail: z.string().trim().email().max(254).nullable().optional(),
    /** The per-person Creem code support created (max_redemptions 1). */
    discountCode: z.string().trim().min(1).max(64).nullable().optional(),
  }),
  z.object({ action: z.literal("clear"), userId: z.string().min(1) }),
]);

/**
 * POST /api/admin/students: support's manual path. `mark` records that a
 * person's proof was checked (`studentSource: manual`) and, optionally, the
 * personal code that checkout should pre-apply for them. `clear` removes the
 * student price and frees the address. Both go to the audit log.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const actorId = await adminActorId(request);
    if (!actorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsed = actionSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "That action is not valid." },
        { status: 400 }
      );
    }
    const input = parsed.data;
    if (input.action === "clear") {
      await clearStudent(input.userId);
      await recordAdminAudit({
        actorId,
        targetUserId: input.userId,
        action: "user.clear_student",
      });
      return NextResponse.json({ ok: true });
    }
    const outcome = await markStudentManually({
      userId: input.userId,
      studentEmail: input.studentEmail,
      discountCode: input.discountCode,
    });
    if (outcome === "missing") {
      return NextResponse.json({ error: "No such account." }, { status: 404 });
    }
    if (outcome === "taken") {
      return NextResponse.json(
        { error: "That student address is on another account." },
        { status: 409 }
      );
    }
    await recordAdminAudit({
      actorId,
      targetUserId: input.userId,
      action: "user.mark_student",
      details: {
        studentEmail: input.studentEmail ?? null,
        personalCode: Boolean(input.discountCode),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Admin student action failed",
      LOG_SOURCE,
      "The action could not be completed."
    );
  }
}
