import { finalizeAccountDeletion } from "@/services/account/account-deletion";
import {
  BillingGrantError,
  MAX_COMP_DAYS,
  describeManualGrant,
  grantManualPlan,
  revokeManualPlan,
} from "@/services/billing/manual-grant";
import {
  TrialExtensionError,
  extendTrialDays,
} from "@/services/billing/trial-extension";
import { AccountDeletionStatus } from "@prisma/client";
import { z } from "zod";

import { revokeAllAccess } from "@/lib/auth/session-version";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { recordAdminAudit } from "./audit";

const LOG_SOURCE = "AdminUserActions";

/** An admin action the caller can be told about in plain words. */
export class AdminActionError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 500,
    message: string
  ) {
    super(message);
    this.name = "AdminActionError";
  }
}

export const MAX_TRIAL_EXTENSION_DAYS = 365;

export const adminUserActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_admin"), admin: z.boolean() }),
  z.object({
    action: z.literal("extend_trial"),
    days: z.number().int().min(1).max(MAX_TRIAL_EXTENSION_DAYS),
  }),
  z.object({
    action: z.literal("grant_plan"),
    kind: z.enum(["pro_days", "lifetime"]),
    days: z.number().int().min(1).max(MAX_COMP_DAYS).optional(),
  }),
  z.object({ action: z.literal("revoke_plan") }),
  z.object({ action: z.literal("sign_out_everywhere") }),
  z.object({ action: z.literal("delete_account"), confirmEmail: z.string() }),
]);

export type AdminUserAction = z.infer<typeof adminUserActionSchema>;

export interface AdminActionResult {
  message: string;
}

async function loadTarget(userId: string) {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });
  if (!target) throw new AdminActionError(404, "That account does not exist.");
  return target;
}

function billingError(error: unknown): never {
  if (error instanceof BillingGrantError) {
    throw new AdminActionError(
      error.code === "INVALID_DAYS" ? 400 : 409,
      error.message
    );
  }
  throw error;
}

async function setAdmin(actorId: string, targetId: string, admin: boolean) {
  if (actorId === targetId) {
    throw new AdminActionError(
      400,
      admin
        ? "You are already an admin."
        : "You cannot remove your own admin role."
    );
  }
  const target = await loadTarget(targetId);
  if ((target.role === "admin") === admin) {
    throw new AdminActionError(
      409,
      admin
        ? "That account is already an admin."
        : "That account is not an admin."
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetId },
      data: { role: admin ? "admin" : "user" },
    });
    await recordAdminAudit(
      {
        actorId,
        targetUserId: targetId,
        action: admin ? "user.make_admin" : "user.remove_admin",
        details: { email: target.email },
      },
      tx
    );
  });
  return { message: admin ? "Made admin." : "Admin role removed." };
}

async function extendTrial(actorId: string, targetId: string, days: number) {
  const target = await loadTarget(targetId);
  const endsAt = await prisma
    .$transaction(async (tx) => {
      const next = await extendTrialDays(tx, {
        userId: targetId,
        email: target.email,
        days,
      });
      await recordAdminAudit(
        {
          actorId,
          targetUserId: targetId,
          action: "user.extend_trial",
          details: { email: target.email, days, endsAt: next.toISOString() },
        },
        tx
      );
      return next;
    })
    .catch((error) => {
      if (error instanceof TrialExtensionError) {
        throw new AdminActionError(409, error.message);
      }
      throw error;
    });
  return { message: `Trial runs until ${endsAt.toISOString().slice(0, 10)}.` };
}

async function grantPlan(
  actorId: string,
  targetId: string,
  kind: "pro_days" | "lifetime",
  days: number | undefined
) {
  if (kind === "pro_days" && days === undefined) {
    throw new AdminActionError(400, "Pro needs a number of days.");
  }
  const target = await loadTarget(targetId);
  const result = await prisma
    .$transaction(async (tx) => {
      const granted = await grantManualPlan(tx, {
        userId: targetId,
        kind,
        days: kind === "pro_days" ? days : null,
      });
      await recordAdminAudit(
        {
          actorId,
          targetUserId: targetId,
          action: "user.grant_plan",
          details: {
            email: target.email,
            kind,
            days: kind === "pro_days" ? (days ?? null) : null,
            until: granted.currentPeriodEnd?.toISOString() ?? null,
          },
        },
        tx
      );
      return granted;
    })
    .catch(billingError);
  return {
    message: `${describeManualGrant(kind, days ?? null)} granted${
      result.currentPeriodEnd
        ? ` until ${result.currentPeriodEnd.toISOString().slice(0, 10)}`
        : ""
    }.`,
  };
}

async function revokePlan(actorId: string, targetId: string) {
  const target = await loadTarget(targetId);
  const { revoked } = await prisma
    .$transaction(async (tx) => {
      const ended = await revokeManualPlan(tx, { userId: targetId });
      await recordAdminAudit(
        {
          actorId,
          targetUserId: targetId,
          action: "user.revoke_plan",
          details: { email: target.email, plan: ended.revoked },
        },
        tx
      );
      return ended;
    })
    .catch(billingError);
  return { message: `${revoked === "LIFETIME" ? "Lifetime" : "Pro"} revoked.` };
}

async function signOutEverywhere(actorId: string, targetId: string) {
  const target = await loadTarget(targetId);
  const [, connectors] = await prisma.$transaction([
    ...revokeAllAccess(targetId),
  ]);
  await recordAdminAudit({
    actorId,
    targetUserId: targetId,
    action: "user.sign_out_everywhere",
    details: { email: target.email, connectorTokensRevoked: connectors.count },
  });
  return { message: "Signed out of every device." };
}

/**
 * Deletes through the same service a person's own deletion uses, minus the
 * seven-day wait: the request is created already due and finalized now, so
 * billing is cancelled, external access revoked and shared content handed
 * over exactly as it is for a self-service deletion. If finalizing fails the
 * request stays FAILED and the existing sweep retries it.
 */
async function deleteAccount(
  actorId: string,
  targetId: string,
  confirmEmail: string
) {
  if (actorId === targetId) {
    throw new AdminActionError(400, "You cannot delete your own account here.");
  }
  const target = await loadTarget(targetId);
  if (
    !target.email ||
    confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()
  ) {
    throw new AdminActionError(
      400,
      "Type the account's email exactly to confirm."
    );
  }
  const now = newDate();
  const request = await prisma.accountDeletionRequest.upsert({
    where: { userId: targetId },
    create: { userId: targetId, scheduledFor: now },
    update: {
      status: AccountDeletionStatus.SCHEDULED,
      scheduledFor: now,
      canceledAt: null,
      completedAt: null,
      errorCode: null,
    },
    select: { id: true },
  });
  await recordAdminAudit({
    actorId,
    targetUserId: targetId,
    action: "user.delete",
    details: { email: target.email, requestId: request.id },
  });
  try {
    await finalizeAccountDeletion(request.id);
  } catch (error) {
    await logger.error(
      "Admin account deletion failed",
      {
        requestId: request.id,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    throw new AdminActionError(
      500,
      "The deletion did not finish. It is queued and will be retried."
    );
  }
  return { message: "Account deleted." };
}

/** Runs one confirmed action. The route has already checked the caller is an admin. */
export async function runAdminUserAction(
  actorId: string,
  targetId: string,
  action: AdminUserAction
): Promise<AdminActionResult> {
  await logger.info(
    "Admin user action",
    { actorId, targetId, action: action.action },
    LOG_SOURCE
  );
  switch (action.action) {
    case "set_admin":
      return setAdmin(actorId, targetId, action.admin);
    case "extend_trial":
      return extendTrial(actorId, targetId, action.days);
    case "grant_plan":
      return grantPlan(actorId, targetId, action.kind, action.days);
    case "revoke_plan":
      return revokePlan(actorId, targetId);
    case "sign_out_everywhere":
      return signOutEverywhere(actorId, targetId);
    case "delete_account":
      return deleteAccount(actorId, targetId, action.confirmEmail);
  }
}
