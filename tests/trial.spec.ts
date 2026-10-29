import { encode } from "next-auth/jwt";

import { expect, request as playwrightRequest, test } from "@playwright/test";
import { createHash } from "node:crypto";

import { getAuthOptions } from "@/lib/auth/auth-options";
import { addCalendarDays, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

const baseURL = process.env.TEST_BASE_URL || "http://localhost:3000";
const runId = `${process.pid}-${newDate().getTime()}`;
const createdEmails: string[] = [];

async function sessionCookie(userId: string, email: string) {
  const secret = process.env.NEXTAUTH_SECRET;
  expect(secret, "NEXTAUTH_SECRET is required for trial e2e").toBeTruthy();
  const value = await encode({
    secret: secret!,
    token: { sub: userId, email, role: "user" },
  });
  return `next-auth.session-token=${value}`;
}

async function keepVerificationOptional() {
  const updated = await prisma.systemSettings.updateMany({
    data: { requireEmailVerificationBeforeAccess: false },
  });
  if (updated.count === 0) {
    await prisma.systemSettings.create({
      data: {
        id: "default",
        requireEmailVerificationBeforeAccess: false,
      },
    });
  }
}

test.describe("no-card Pro trial", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await keepVerificationOptional();
  });

  test.afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: createdEmails } },
      select: { id: true },
    });
    await prisma.verificationToken.deleteMany({
      where: { identifier: { in: createdEmails } },
    });
    await prisma.trialGrant.deleteMany({
      where: { userId: { in: users.map((user) => user.id) } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: users.map((user) => user.id) } },
    });
    await prisma.$disconnect();
  });

  test("signup stays Free, confirmation starts Pro, expiry keeps data", async ({
    request,
  }) => {
    const email = `trial-${runId}@example.com`;
    createdEmails.push(email);
    const registration = await request.post("/api/auth/register", {
      data: {
        email,
        password: "Needt-trial-Password1",
        name: "Trial E2E",
        ageConfirmed: true,
      },
    });
    expect(registration.status()).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true, emailVerified: true },
    });
    expect(user.emailVerified).toBeNull();

    const authenticated = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { cookie: await sessionCookie(user.id, email) },
    });
    const freeBilling = await authenticated.get("/api/billing");
    expect((await freeBilling.json()).plan).toBe("FREE");

    const booking = await authenticated.post("/api/booking-pages", {
      data: { title: "Blocked", slug: `blocked-${runId}` },
    });
    expect(booking.status()).toBe(403);
    await expect(booking.json()).resolves.toMatchObject({
      code: "EMAIL_VERIFICATION_REQUIRED",
    });

    const taskTitle = `Trial data survives ${runId}`;
    const task = await authenticated.post("/api/tasks", {
      data: { title: taskTitle, status: "todo", isAutoScheduled: false },
    });
    expect(task.ok()).toBeTruthy();

    const rawToken = `known-${runId}`;
    const token = createHash("sha256").update(rawToken).digest("hex");
    await prisma.verificationToken.deleteMany({ where: { identifier: email } });
    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token,
        expires: addCalendarDays(newDate(), 1),
      },
    });
    const landing = await authenticated.get(
      `/auth/confirm-email?email=${encodeURIComponent(email)}&token=${encodeURIComponent(rawToken)}`
    );
    expect(landing.ok()).toBeTruthy();
    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { emailVerified: true },
      })
    ).resolves.toMatchObject({ emailVerified: null });
    await expect(
      prisma.verificationToken.findUnique({
        where: { identifier_token: { identifier: email, token } },
      })
    ).resolves.not.toBeNull();

    const confirmation = await authenticated.post(
      "/api/auth/email-verification/confirm",
      { data: { email, token: rawToken } }
    );
    expect(confirmation.ok()).toBeTruthy();

    const proBilling = await authenticated.get("/api/billing");
    await expect(proBilling.json()).resolves.toMatchObject({
      plan: "PRO",
      isTrial: true,
    });

    await prisma.trialGrant.update({
      where: { userId: user.id },
      data: { endsAt: addCalendarDays(newDate(), -1) },
    });
    const expiredBilling = await authenticated.get("/api/billing");
    await expect(expiredBilling.json()).resolves.toMatchObject({
      plan: "FREE",
      isTrial: false,
    });
    const tasks = await authenticated.get("/api/tasks");
    expect(JSON.stringify(await tasks.json())).toContain(taskTitle);
    await authenticated.dispose();
  });

  test("OAuth callback verifies the adapter user and starts Pro immediately", async ({
    request,
  }) => {
    const email = `oauth-trial-${runId}@example.com`;
    createdEmails.push(email);
    const user = await prisma.user.create({
      data: { email, name: "OAuth Trial" },
      select: { id: true },
    });
    const options = await getAuthOptions();
    const jwt = options.callbacks?.jwt;
    expect(jwt).toBeDefined();
    await (jwt as NonNullable<typeof jwt>)({
      token: {},
      user: { id: user.id, email },
      account: {
        provider: "google",
        type: "oauth",
        providerAccountId: `google-${runId}`,
      },
      profile: { email, email_verified: true },
      isNewUser: true,
      trigger: "signIn",
    } as never);

    const cookie = await sessionCookie(user.id, email);
    const billing = await request.get("/api/billing", {
      headers: { cookie },
    });
    await expect(billing.json()).resolves.toMatchObject({
      plan: "PRO",
      isTrial: true,
    });
    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { emailVerified: true },
      })
    ).resolves.toMatchObject({ emailVerified: expect.any(Date) });
  });
});
