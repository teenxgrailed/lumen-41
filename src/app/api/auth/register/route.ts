import { NextRequest, NextResponse } from "next/server";

import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { z } from "zod";

import { AGE_CONFIRM_REQUIRED_MESSAGE } from "@/lib/auth/age-confirmation-copy";
import { isPublicSignupEnabled } from "@/lib/auth/public-signup";
import {
  SIGNUPS_CLOSED_CODE,
  SIGNUPS_CLOSED_MESSAGE,
  areSignupsOpen,
} from "@/lib/auth/signups";
import {
  isUnprovenPasswordAccount,
  replaceUnprovenPassword,
  unprovenPasswordReplaceable,
} from "@/lib/auth/unproven-password";
import { newDate } from "@/lib/date-utils";
import { sendEmailVerification } from "@/lib/email/email-verification";
import { logger } from "@/lib/logger";
import { signupLocaleSettings } from "@/lib/needt3/locale-defaults";
import { SETUP_PATH, onboardingEntryPath } from "@/lib/onboarding/entry";
import { prisma } from "@/lib/prisma";
import { publicRequestUrl } from "@/lib/public-url";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

const LOG_SOURCE = "RegisterAPI";

const registrationSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().trim().max(100).optional(),
  // The browser's zone and language: the account starts in the right time.
  timeZone: z.string().max(64).optional(),
  locale: z.string().max(35).optional(),
  // "I'm 16 or older and agree to the Terms and Privacy Policy": required, and
  // stored as User.ageConfirmedAt. Anything but literal true is refused.
  ageConfirmed: z.unknown().refine((value) => value === true, {
    message: AGE_CONFIRM_REQUIRED_MESSAGE,
  }),
});

export async function POST(request: NextRequest) {
  try {
    if (!(await areSignupsOpen())) {
      logger.warn(
        "Registration attempted while signups are closed",
        {},
        LOG_SOURCE
      );
      return NextResponse.json(
        { error: SIGNUPS_CLOSED_MESSAGE, code: SIGNUPS_CLOSED_CODE },
        { status: 403 }
      );
    }

    if (!(await isPublicSignupEnabled())) {
      logger.warn(
        "Registration attempted while public signup is disabled",
        {},
        LOG_SOURCE
      );
      return NextResponse.json(
        { error: "Public registration is currently disabled" },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid registration request" },
        { status: 400 }
      );
    }

    const parsed = registrationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message || "Invalid registration details",
        },
        { status: 400 }
      );
    }

    const email = parsed.data.email.toLowerCase();
    const limited = await enforceRateLimits(
      [
        ipRule(request, "register:ip", 5, 60 * 60),
        accountRule(email, "register:account", 3, 60 * 60),
      ],
      { route: request.nextUrl.pathname }
    );
    if (limited) return limited;

    const passwordHash = await hash(parsed.data.password, 12);

    /* An address that registered but never confirmed holds a password nobody
       has proven. Registering it again after a day replaces that password, so
       a squatter cannot hold someone else's address; sooner, the answer is the
       same as for any taken address. */
    const existing = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        emailVerified: true,
        createdAt: true,
        accounts: {
          where: { provider: "credentials" },
          select: { provider: true, id_token: true },
        },
      },
    });
    if (existing) {
      if (
        isUnprovenPasswordAccount(existing) &&
        unprovenPasswordReplaceable(existing.createdAt)
      ) {
        await replaceUnprovenPassword({
          userId: existing.id,
          passwordHash,
          action: "auth.unproven_password_replaced",
        });
        /* The new window starts now, and links mailed earlier die. */
        await prisma.$transaction([
          prisma.user.update({
            where: { id: existing.id },
            data: { createdAt: newDate() },
            select: { id: true },
          }),
          prisma.verificationToken.deleteMany({
            where: { identifier: email },
          }),
        ]);
        try {
          await sendEmailVerification({
            userId: existing.id,
            baseUrl: publicRequestUrl(request).origin,
          });
        } catch (error) {
          logger.error(
            "Email verification delivery failed after replacing an unproven password",
            {
              userId: existing.id,
              error: error instanceof Error ? error.message : "Unknown error",
            },
            LOG_SOURCE
          );
        }
      }
      return NextResponse.json({ success: true }, { status: 201 });
    }

    const user = await prisma.user.create({
      data: {
        email,
        name: parsed.data.name || email.split("@")[0],
        ageConfirmedAt: newDate(),
        accounts: {
          create: {
            type: "credentials",
            provider: "credentials",
            providerAccountId: email,
            id_token: passwordHash,
          },
        },
        userSettings: {
          create: {
            theme: "dark",
            timeZone: "UTC",
            ...signupLocaleSettings(parsed.data),
          },
        },
        autoScheduleSettings: {
          create: {
            workDays: "[1,2,3,4,5]",
            workHourStart: 9,
            workHourEnd: 17,
            bufferMinutes: 15,
          },
        },
      },
      select: { id: true },
    });

    logger.info(
      "User registered successfully",
      { userId: user.id },
      LOG_SOURCE
    );
    try {
      await sendEmailVerification({
        userId: user.id,
        baseUrl: publicRequestUrl(request).origin,
      });
    } catch (error) {
      logger.error(
        "Initial email verification delivery failed",
        {
          userId: user.id,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        LOG_SOURCE
      );
    }
    /* Which onboarding this account starts in (`onboarding_v3`, per user). A
       flag read that fails is the old flow, never a failed sign-up. */
    const next = await onboardingEntryPath(user.id).catch(() => SETUP_PATH);
    return NextResponse.json(
      { success: true, emailVerificationPending: true, next },
      { status: 201 }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ success: true }, { status: 201 });
    }

    logger.error(
      "Registration failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Registration failed. Please try again." },
      { status: 500 }
    );
  }
}
