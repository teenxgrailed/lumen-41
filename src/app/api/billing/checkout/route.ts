import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { WITHDRAWAL_WAIVER_REQUIRED_MESSAGE } from "@/lib/billing/withdrawal-waiver";
import { getCreemClient } from "@/lib/creem/client";
import {
  BillingCheckoutSelection,
  getCreemProductId,
  isCreemConfigured,
} from "@/lib/creem/config";
import {
  attachLifetimeCheckout,
  reserveLifetimeCheckout,
} from "@/lib/creem/lifetime-cap";
import { newDate } from "@/lib/date-utils";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { BILLING_CHECKOUT } from "@/lib/feature-flags-keys";
import { LEGAL_EFFECTIVE_DATE } from "@/lib/legal/operator";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { publicAppUrl } from "@/lib/public-url";
import { refuseSandbox } from "@/lib/sandbox/guard";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

const LOG_SOURCE = "CreemCheckoutAPI";

/** `from: "onboarding"` returns the buyer to the onboarding's last screen. */
const fromSchema = z.literal("onboarding").optional();

/**
 * Terms 5.5: the buyer's acknowledgement that Needt starts now and the 14-day
 * withdrawal right ends once it has. Checked after the plan is valid, so a
 * wrong plan still says so; see `withdrawal-waiver.ts`.
 */
const waiverSchema = z.boolean().optional();

const checkoutSchema = z.discriminatedUnion("plan", [
  z.object({
    plan: z.literal("pro"),
    interval: z.enum(["month", "year"]),
    from: fromSchema,
    withdrawalWaiver: waiverSchema,
  }),
  z.object({
    plan: z.literal("lifetime"),
    from: fromSchema,
    withdrawalWaiver: waiverSchema,
  }),
]);

/**
 * Whether checkout can open for this account right now (keys set and the
 * billing flag on). The onboarding's card step asks before it offers a card,
 * so a closed checkout reads as "opens soon", not as an error.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const available =
    isCreemConfigured() &&
    (await isFeatureEnabled(BILLING_CHECKOUT, auth.userId));
  return NextResponse.json({ available });
}

function checkoutRequestId(
  userId: string,
  selection: BillingCheckoutSelection,
  date = newDate()
) {
  const interval = selection.plan === "pro" ? selection.interval : "once";
  return `needt-${userId}-${selection.plan}-${interval}-${date
    .toISOString()
    .slice(0, 16)}`;
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const locked = await refuseSandbox(auth.userId, "billing");
  if (locked) return locked;

  const limited = await enforceRateLimits(
    [
      ipRule(request, "billing-checkout:ip", 10, 60 * 60),
      accountRule(auth.userId, "billing-checkout:account", 5, 60 * 60),
    ],
    { route: "/api/billing/checkout", userId: auth.userId }
  );
  if (limited) return limited;

  if (!isCreemConfigured()) {
    return NextResponse.json(
      { error: "Billing is not configured." },
      { status: 503 }
    );
  }

  // Payments stay closed until the owner turns the flag on (legal pages
  // published, payment provider review passed), whatever screen asks.
  if (!(await isFeatureEnabled(BILLING_CHECKOUT, auth.userId))) {
    return NextResponse.json(
      { error: "Checkout opens soon." },
      { status: 503 }
    );
  }

  const parsed = checkoutSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid billing plan selection." },
      { status: 400 }
    );
  }

  if (parsed.data.withdrawalWaiver !== true) {
    return NextResponse.json(
      { error: WITHDRAWAL_WAIVER_REQUIRED_MESSAGE },
      { status: 400 }
    );
  }

  try {
    const selection = parsed.data as BillingCheckoutSelection;
    const productId = getCreemProductId(selection);
    if (!productId) {
      return NextResponse.json(
        { error: "This billing option is not configured." },
        { status: 503 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { email: true, emailVerified: true, name: true },
    });
    if (!user?.email || !user.emailVerified) {
      return NextResponse.json(
        { error: "A verified account email is required for checkout." },
        { status: 400 }
      );
    }

    // The acknowledgement is recorded before anything is reserved or created:
    // when, and the Terms version it was shown against.
    const waiverAt = newDate();
    await prisma.user.update({
      where: { id: auth.userId },
      data: {
        withdrawalWaiverAt: waiverAt,
        withdrawalWaiverTermsVersion: LEGAL_EFFECTIVE_DATE,
      },
    });

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      process.env.NEXTAUTH_URL?.trim() ||
      publicAppUrl("/", request).origin;
    const onboarding = parsed.data.from === "onboarding";
    const successUrl = new URL(onboarding ? "/start" : "/settings", appUrl);
    successUrl.searchParams.set("billing", "success");
    if (onboarding) successUrl.searchParams.set("step", "opening");
    else successUrl.hash = "billing";

    const lifetimeReservation =
      selection.plan === "lifetime"
        ? await reserveLifetimeCheckout(auth.userId)
        : null;
    if (lifetimeReservation?.outcome === "closed") {
      return NextResponse.json(
        { error: "Lifetime is closed.", code: "LIFETIME_CLOSED" },
        { status: 409 }
      );
    }
    if (lifetimeReservation?.outcome === "already_owned") {
      return NextResponse.json(
        { error: "Lifetime is already active on this account." },
        { status: 409 }
      );
    }
    if (lifetimeReservation?.reservation.checkoutUrl) {
      return NextResponse.json({
        url: lifetimeReservation.reservation.checkoutUrl,
      });
    }

    const checkout = await getCreemClient().checkouts.create({
      productId,
      requestId:
        lifetimeReservation?.reservation.requestId ??
        checkoutRequestId(auth.userId, selection),
      customer: {
        email: user.email,
        ...(user.name ? { name: user.name } : {}),
      },
      successUrl: successUrl.toString(),
      metadata: {
        referenceId: auth.userId,
        userId: auth.userId,
        plan: selection.plan,
        interval: selection.plan === "pro" ? selection.interval : "once",
        withdrawalWaiver: "true",
        withdrawalWaiverAt: waiverAt.toISOString(),
        termsVersion: LEGAL_EFFECTIVE_DATE,
        ...(lifetimeReservation
          ? { lifetimeReservationId: lifetimeReservation.reservation.id }
          : {}),
      },
    });
    if (!checkout.checkoutUrl) {
      throw new Error("Creem did not return a checkout URL.");
    }
    if (lifetimeReservation) {
      await attachLifetimeCheckout(lifetimeReservation.reservation.id, {
        id: checkout.id,
        checkoutUrl: checkout.checkoutUrl,
      });
    }

    return NextResponse.json({ url: checkout.checkoutUrl });
  } catch (error) {
    await logger.error(
      "Failed to create Creem checkout",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Could not start checkout." },
      { status: 502 }
    );
  }
}
