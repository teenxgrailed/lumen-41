import { encode } from "next-auth/jwt";

import { expect, request as playwrightRequest, test } from "@playwright/test";
import { createHash } from "node:crypto";

import { addCalendarDays, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

const baseURL = process.env.TEST_BASE_URL || "http://localhost:3000";
const runId = `${process.pid}-${newDate().getTime()}`;
const email = `gate-${runId}@example.com`;

let original: boolean | undefined;

test.describe("mandatory email confirmation", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    const row = await prisma.systemSettings.findFirst({
      select: { requireEmailVerificationBeforeAccess: true },
    });
    original = row?.requireEmailVerificationBeforeAccess;
    const updated = await prisma.systemSettings.updateMany({
      data: { requireEmailVerificationBeforeAccess: true },
    });
    if (updated.count === 0) {
      await prisma.systemSettings.create({
        data: { id: "default", requireEmailVerificationBeforeAccess: true },
      });
    }
  });

  test.afterAll(async () => {
    await prisma.systemSettings.updateMany({
      data: { requireEmailVerificationBeforeAccess: original ?? true },
    });
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    await prisma.verificationToken.deleteMany({ where: { identifier: email } });
    if (user) {
      await prisma.trialGrant.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await prisma.$disconnect();
  });

  test("sign up, blocked, open the link, the app answers", async ({
    request,
  }) => {
    const registration = await request.post("/api/auth/register", {
      data: { email, password: "Needt-gate-Password1", name: "Gate E2E" },
    });
    expect(registration.status()).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true, emailVerified: true },
    });
    expect(user.emailVerified).toBeNull();

    const secret = process.env.NEXTAUTH_SECRET;
    expect(secret).toBeTruthy();
    const cookie = `next-auth.session-token=${await encode({
      secret: secret!,
      token: { sub: user.id, email, role: "user" },
    })}`;
    const session = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { cookie },
    });

    const blocked = await session.get("/api/tasks");
    expect(blocked.status()).toBe(403);
    await expect(blocked.json()).resolves.toMatchObject({
      code: "EMAIL_VERIFICATION_REQUIRED",
    });

    const rawToken = `gate-token-${runId}`;
    await prisma.verificationToken.deleteMany({ where: { identifier: email } });
    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token: createHash("sha256").update(rawToken).digest("hex"),
        expires: addCalendarDays(newDate(), 1),
      },
    });
    const confirmed = await session.post(
      "/api/auth/email-verification/confirm",
      { data: { email, token: rawToken } }
    );
    expect(confirmed.ok()).toBeTruthy();
    await expect(confirmed.json()).resolves.toMatchObject({
      status: "verified",
    });

    // Single use: the same link does not work twice.
    const again = await session.post("/api/auth/email-verification/confirm", {
      data: { email, token: rawToken },
    });
    await expect(again.json()).resolves.toMatchObject({ status: "invalid" });

    const open = await session.get("/api/tasks");
    expect(open.ok()).toBeTruthy();
  });
});
