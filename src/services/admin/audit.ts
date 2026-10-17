import { getToken } from "next-auth/jwt";
import { type NextRequest } from "next/server";

import { Prisma } from "@prisma/client";

import { authSecret } from "@/lib/auth/auth-secret";
import { prisma } from "@/lib/prisma";

export type AdminAuditAction =
  | "user.make_admin"
  | "user.remove_admin"
  | "user.extend_trial"
  | "user.grant_plan"
  | "user.revoke_plan"
  | "user.sign_out_everywhere"
  | "user.delete"
  | "promo.create"
  | "promo.deactivate";

type Writer = Pick<Prisma.TransactionClient, "adminAuditLog">;

/**
 * Records one admin change. Pass the transaction the change itself runs in so
 * the record and the change commit together. `details` must hold no secret:
 * ids, emails, counts and dates only.
 */
export async function recordAdminAudit(
  input: {
    actorId: string;
    targetUserId?: string | null;
    action: AdminAuditAction;
    details?: Prisma.InputJsonValue;
  },
  tx: Writer = prisma
) {
  return tx.adminAuditLog.create({
    data: {
      actorId: input.actorId,
      targetUserId: input.targetUserId ?? null,
      action: input.action,
      details: input.details ?? Prisma.JsonNull,
    },
    select: { id: true },
  });
}

/**
 * Who is making an admin request. `requireAdmin` only answers yes or no, so
 * the route reads the same session token for the id. Null means no session,
 * which a route that got past `requireAdmin` never sees.
 */
export async function adminActorId(
  request: NextRequest
): Promise<string | null> {
  const token = await getToken({ req: request, secret: authSecret() });
  return token?.sub ?? null;
}

export async function listAuditForUser(userId: string, take = 20) {
  const rows = await prisma.adminAuditLog.findMany({
    where: { targetUserId: userId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      actorId: true,
      action: true,
      details: true,
      createdAt: true,
    },
  });
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}
