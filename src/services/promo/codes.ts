import { recordAdminAudit } from "@/services/admin/audit";
import { MAX_COMP_DAYS } from "@/services/billing/manual-grant";
import { Prisma } from "@prisma/client";
import { randomInt } from "node:crypto";
import { z } from "zod";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

/**
 * //todo: Creem discount-code kind (needs the owner's Creem account). A code
 * that lowers a price has to be created in Creem and applied at checkout;
 * nothing here calls Creem, so the three kinds below only grant time or a plan.
 */
export const PROMO_KINDS = ["trial_days", "pro_days", "lifetime"] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];

/** Letters and digits that cannot be misread (no 0/O, 1/I/L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,39}$/;

/** What a person typed, made comparable: trimmed and upper-case. */
export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** "K7M2P-9XQ4R": ten characters from a cryptographic source. */
export function generatePromoCode(): string {
  const pick = () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  const half = () => Array.from({ length: 5 }, pick).join("");
  return `${half()}-${half()}`;
}

export const createPromoSchema = z
  .object({
    code: z.string().transform(normalizePromoCode),
    kind: z.enum(PROMO_KINDS),
    value: z.number().int().min(1).max(MAX_COMP_DAYS).nullish(),
    maxRedemptions: z.number().int().min(1).max(1_000_000).nullish(),
    expiresAt: z
      .string()
      .datetime()
      .nullish()
      .transform((v) => (v ? newDate(v) : null)),
  })
  .superRefine((input, ctx) => {
    if (!CODE_PATTERN.test(input.code)) {
      ctx.addIssue({
        code: "custom",
        path: ["code"],
        message: "Use 3 to 40 letters, digits or dashes.",
      });
    }
    if (input.kind !== "lifetime" && !input.value) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "This kind needs a number of days.",
      });
    }
  });

export type CreatePromoInput = z.infer<typeof createPromoSchema>;

export class PromoAdminError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string
  ) {
    super(message);
    this.name = "PromoAdminError";
  }
}

export interface AdminPromoCode {
  id: string;
  code: string;
  kind: string;
  value: number | null;
  maxRedemptions: number | null;
  redeemedCount: number;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
}

const promoSelect = {
  id: true,
  code: true,
  kind: true,
  value: true,
  maxRedemptions: true,
  redeemedCount: true,
  expiresAt: true,
  active: true,
  createdAt: true,
} satisfies Prisma.PromoCodeSelect;

function toAdminPromo(
  row: Prisma.PromoCodeGetPayload<{ select: typeof promoSelect }>
): AdminPromoCode {
  return {
    ...row,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listPromoCodes(): Promise<AdminPromoCode[]> {
  const rows = await prisma.promoCode.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: promoSelect,
  });
  return rows.map(toAdminPromo);
}

export async function createPromoCode(
  actorId: string,
  input: CreatePromoInput
): Promise<AdminPromoCode> {
  const value = input.kind === "lifetime" ? null : (input.value ?? null);
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.promoCode.create({
        data: {
          code: input.code,
          kind: input.kind,
          value,
          maxRedemptions: input.maxRedemptions ?? null,
          expiresAt: input.expiresAt,
          createdById: actorId,
        },
        select: promoSelect,
      });
      await recordAdminAudit(
        {
          actorId,
          action: "promo.create",
          details: {
            code: row.code,
            kind: row.kind,
            value: row.value,
            maxRedemptions: row.maxRedemptions,
          },
        },
        tx
      );
      return toAdminPromo(row);
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new PromoAdminError(409, "That code already exists.");
    }
    throw error;
  }
}

export async function deactivatePromoCode(
  actorId: string,
  id: string
): Promise<AdminPromoCode> {
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.promoCode.update({
        where: { id },
        data: { active: false },
        select: promoSelect,
      });
      await recordAdminAudit(
        {
          actorId,
          action: "promo.deactivate",
          details: { code: row.code },
        },
        tx
      );
      return toAdminPromo(row);
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new PromoAdminError(404, "That code does not exist.");
    }
    throw error;
  }
}

export interface AdminPromoRedemption {
  id: string;
  userId: string;
  email: string | null;
  createdAt: string;
}

export async function listPromoRedemptions(
  codeId: string
): Promise<AdminPromoRedemption[]> {
  const rows = await prisma.promoRedemption.findMany({
    where: { codeId },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      userId: true,
      createdAt: true,
      user: { select: { email: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    email: row.user.email,
    createdAt: row.createdAt.toISOString(),
  }));
}
