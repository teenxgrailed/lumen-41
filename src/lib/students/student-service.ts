import { Prisma, StudentSource } from "@prisma/client";

import {
  type BillingCheckoutSelection,
  NEEDT_PRICING,
  getStudentDiscountCode,
} from "@/lib/creem/config";
import { addCalendarDays, newDate } from "@/lib/date-utils";
import { EmailService } from "@/lib/email/email-service";
import { getStudentVerifyTemplate } from "@/lib/email/templates/student";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { signStudentToken, verifyStudentToken } from "./token";
import { universityDomainFor } from "./university-domains";

const LOG_SOURCE = "StudentService";

/** A proof of student status lasts a year; the yearly re-check renews it. */
export const STUDENT_PROOF_VALID_DAYS = 365;

export const STUDENT_SUPPORT_EMAIL = "students@needt.app";

export const STUDENT_USER_SELECT = {
  id: true,
  email: true,
  emailVerified: true,
  studentEmail: true,
  studentVerifiedAt: true,
  studentSource: true,
  studentDiscountCode: true,
  studentLapsedAt: true,
} as const satisfies Prisma.UserSelect;

export type StudentUser = Prisma.UserGetPayload<{
  select: typeof STUDENT_USER_SELECT;
}>;

export type StudentStatus = "none" | "verified" | "lapsed";

export type StudentStanding = {
  status: StudentStatus;
  /** The sign-in address is confirmed and at a recognised university. */
  accountEmailQualifies: boolean;
  /** Checkout will apply the student price on Pro monthly and yearly. */
  priceApplies: boolean;
};

function proofIsCurrent(user: StudentUser, now: Date): boolean {
  if (!user.studentVerifiedAt) return false;
  // Support's grant carries no address to re-check by mail; it holds until
  // support clears it.
  if (user.studentSource === StudentSource.manual) return true;
  return (
    user.studentVerifiedAt > addCalendarDays(now, -STUDENT_PROOF_VALID_DAYS)
  );
}

/** Pure: where a person stands, from their row and the configured code. */
export function studentStanding(
  user: StudentUser,
  now: Date = newDate(),
  sharedCode: string | null = getStudentDiscountCode()
): StudentStanding {
  const accountEmailQualifies = Boolean(
    user.emailVerified && universityDomainFor(user.email)
  );
  const status: StudentStatus = user.studentLapsedAt
    ? "lapsed"
    : proofIsCurrent(user, now)
      ? "verified"
      : "none";
  const eligible =
    status === "verified" || (status === "none" && accountEmailQualifies);
  const code =
    user.studentSource === StudentSource.manual && user.studentDiscountCode
      ? user.studentDiscountCode
      : sharedCode;
  return {
    status,
    accountEmailQualifies,
    priceApplies: eligible && Boolean(code),
  };
}

/**
 * Pure: the discount code a checkout carries, or null. Only Pro monthly and
 * Pro yearly ever get one; Lifetime is never discounted.
 */
export function studentCheckoutCode(
  selection: BillingCheckoutSelection,
  user: StudentUser,
  now: Date = newDate(),
  sharedCode: string | null = getStudentDiscountCode()
): string | null {
  if (selection.plan !== "pro") return null;
  if (!studentStanding(user, now, sharedCode).priceApplies) return null;
  if (user.studentSource === StudentSource.manual && user.studentDiscountCode) {
    return user.studentDiscountCode;
  }
  return sharedCode;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * The code for this checkout, recording the student proof on the way: a
 * confirmed sign-in address at a university is proof enough, so the first
 * checkout from one stores it (`studentSource: auto`). Another account that
 * already holds that address keeps it; this one pays the regular price.
 */
export async function studentDiscountForCheckout(
  userId: string,
  selection: BillingCheckoutSelection,
  now: Date = newDate()
): Promise<string | null> {
  if (selection.plan !== "pro") return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: STUDENT_USER_SELECT,
  });
  if (!user) return null;
  const code = studentCheckoutCode(selection, user, now);
  if (!code) return null;
  const standing = studentStanding(user, now);
  if (standing.status === "verified") return code;

  const email = (user.email ?? "").trim().toLowerCase();
  if (!(await recordStudentProof(userId, email, now))) {
    logger.info(
      "Student address already backs another account",
      { userId },
      LOG_SOURCE
    );
    return null;
  }
  return code;
}

export type StudentLinkOutcome =
  | "sent"
  | "verified"
  | "not_university"
  | "taken"
  | "invalid";

function confirmUrl(baseUrl: string, token: string): string {
  const url = new URL("/api/students/confirm", baseUrl);
  url.searchParams.set("t", token);
  return url.toString();
}

/**
 * Settings, Plan, "Add a university email": mails a signed link to the
 * address. The account's own confirmed address needs no second proof and is
 * recorded at once.
 */
export async function requestStudentEmailLink(input: {
  userId: string;
  email: string;
  baseUrl: string;
  now?: Date;
}): Promise<StudentLinkOutcome> {
  const now = input.now ?? newDate();
  const email = input.email.trim().toLowerCase();
  if (!universityDomainFor(email)) return "not_university";

  const [user, holder] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, emailVerified: true },
    }),
    prisma.user.findUnique({
      where: { studentEmail: email },
      select: { id: true },
    }),
  ]);
  if (!user) return "invalid";
  if (holder && holder.id !== input.userId) return "taken";

  if (user.emailVerified && user.email?.trim().toLowerCase() === email) {
    return (await recordStudentProof(input.userId, email, now))
      ? "verified"
      : "taken";
  }

  const token = signStudentToken(
    { userId: input.userId, email, purpose: "verify" },
    now.getTime()
  );
  const result = await EmailService.sendEmail({
    to: email,
    ...getStudentVerifyTemplate({
      confirmUrl: confirmUrl(input.baseUrl, token),
    }),
  });
  await logger.info(
    "Student email link sent",
    { userId: input.userId, jobId: result.jobId },
    LOG_SOURCE
  );
  return "sent";
}

/** Stores a proven address. False when another account already holds it. */
async function recordStudentProof(
  userId: string,
  email: string,
  now: Date
): Promise<boolean> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        studentEmail: email,
        studentVerifiedAt: now,
        studentSource: StudentSource.auto,
        studentDiscountCode: null,
        studentRecheckSentAt: null,
        studentLapsedAt: null,
      },
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

export type StudentConfirmOutcome =
  | "verified"
  | "invalid"
  | "not_university"
  | "taken";

/** The link in a verify or re-check mail was opened and confirmed. */
export async function confirmStudentToken(
  token: string | null | undefined,
  now: Date = newDate()
): Promise<StudentConfirmOutcome> {
  const claims = verifyStudentToken(token, now.getTime());
  if (!claims) return "invalid";
  if (!universityDomainFor(claims.email)) return "not_university";
  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, studentEmail: true },
  });
  if (!user) return "invalid";
  // A re-check confirms the address the price rests on, not a new one.
  if (claims.purpose === "recheck" && user.studentEmail !== claims.email) {
    return "invalid";
  }
  return (await recordStudentProof(user.id, claims.email, now))
    ? "verified"
    : "taken";
}

/** What `GET /api/billing` says about the student price. */
export type StudentSummary = StudentStanding & {
  email: string | null;
  source: "auto" | "manual" | null;
  percentOff: number;
  supportEmail: string;
};

export async function studentSummary(
  userId: string,
  now: Date = newDate()
): Promise<StudentSummary | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: STUDENT_USER_SELECT,
  });
  if (!user) return null;
  return {
    ...studentStanding(user, now),
    email: user.studentEmail,
    source: user.studentSource,
    percentOff: NEEDT_PRICING.student.percentOff,
    supportEmail: STUDENT_SUPPORT_EMAIL,
  };
}

/** Support's manual grant (admin route): proof checked by a person. */
export async function markStudentManually(input: {
  userId: string;
  studentEmail?: string | null;
  discountCode?: string | null;
  now?: Date;
}): Promise<"ok" | "taken" | "missing"> {
  const now = input.now ?? newDate();
  try {
    await prisma.user.update({
      where: { id: input.userId },
      data: {
        studentSource: StudentSource.manual,
        studentVerifiedAt: now,
        studentLapsedAt: null,
        studentRecheckSentAt: null,
        ...(input.studentEmail !== undefined
          ? { studentEmail: input.studentEmail?.trim().toLowerCase() || null }
          : {}),
        ...(input.discountCode !== undefined
          ? { studentDiscountCode: input.discountCode?.trim() || null }
          : {}),
      },
    });
    return "ok";
  } catch (error) {
    if (isUniqueViolation(error)) return "taken";
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return "missing";
    }
    throw error;
  }
}

/** Support removes a student price; the address is freed for its owner. */
export async function clearStudent(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      studentEmail: null,
      studentVerifiedAt: null,
      studentSource: null,
      studentDiscountCode: null,
      studentRecheckSentAt: null,
      studentLapsedAt: null,
    },
  });
}
