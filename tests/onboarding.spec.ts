import { type Page, expect, test } from "@playwright/test";
import { createHash } from "node:crypto";

import { addCalendarDays, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

const runId = `${process.pid}-${newDate().getTime()}`;
const createdEmails: string[] = [];
let originalFirstRunSettings:
  | {
      publicSignup: boolean;
      requireEmailVerificationBeforeAccess: boolean;
    }
  | null
  | undefined;

async function enablePublicFirstRun() {
  originalFirstRunSettings = await prisma.systemSettings.findUnique({
    where: { id: "default" },
    select: {
      publicSignup: true,
      requireEmailVerificationBeforeAccess: true,
    },
  });
  await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: {
      publicSignup: true,
      requireEmailVerificationBeforeAccess: false,
    },
    create: {
      id: "default",
      publicSignup: true,
      requireEmailVerificationBeforeAccess: false,
    },
  });
}

async function restoreFirstRunSettings() {
  if (originalFirstRunSettings === undefined) return;
  if (originalFirstRunSettings === null) {
    await prisma.systemSettings.deleteMany({ where: { id: "default" } });
    return;
  }
  await prisma.systemSettings.update({
    where: { id: "default" },
    data: originalFirstRunSettings,
  });
}

async function cleanupCreatedUsers() {
  const users = await prisma.user.findMany({
    where: { email: { in: createdEmails } },
    select: { id: true, personalWorkspace: { select: { id: true } } },
  });
  const userIds = users.map(({ id }) => id);
  const workspaceIds = users.flatMap(({ personalWorkspace }) =>
    personalWorkspace ? [personalWorkspace.id] : []
  );

  await prisma.verificationToken.deleteMany({
    where: { identifier: { in: createdEmails } },
  });
  await prisma.task.deleteMany({
    where: { workspaceId: { in: workspaceIds } },
  });
  await prisma.schedulingRun.deleteMany({
    where: { workspaceId: { in: workspaceIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true);
}

test.describe("clean-database first run", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await enablePublicFirstRun();
  });

  test.afterAll(async () => {
    try {
      await cleanupCreatedUsers();
    } finally {
      try {
        await restoreFirstRunSettings();
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  for (const viewport of [360, 390]) {
    test(`${viewport}px: signup, onboarding and email verification`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: viewport, height: 844 });
      await page.route("**/api/auth/register", async (route) => {
        await route.continue({
          headers: {
            ...route.request().headers(),
            "x-forwarded-for": `203.0.113.${((process.pid + viewport) % 250) + 1}`,
          },
        });
      });

      await page.goto("/auth/signin?error=OAuthAccountNotLinked");
      /* The v3 phone face announces it in a note, not a <p>; the role is
         what has to hold. */
      const authAlert = page
        .getByRole("alert")
        .filter({ hasText: "method you used before" });
      await expect(authAlert).toBeVisible();
      await expect(authAlert).not.toContainText("OAuthAccountNotLinked");

      const email = `onboarding-${viewport}-${runId}@example.com`;
      const password = "Needt-onboarding-Password1";
      createdEmails.push(email);

      /* The v3 phone sign-in: no tabs and no second password field (the
         show/hide eye covers the typo the confirmation guarded against). The
         switch only appears where public sign-up is allowed, which a clean
         database is. A new account goes on to first-run setup. */
      await page.getByRole("button", { name: /Create one/ }).click();
      /* Every sign-up confirms 16+ and the Terms first; without the tick the
         form does not submit. */
      await page.getByRole("checkbox", { name: /16 or older/ }).check();
      await page.getByRole("textbox", { name: "Email" }).fill(email);
      await page
        .getByRole("textbox", { name: "Password", exact: true })
        .fill(password);
      await page.getByRole("button", { name: "Create the account" }).click();
      await expect(page).toHaveURL(/\/setup$/, { timeout: 30_000 });
      await expect(page.locator("[data-onboarding-step]").first()).toBeVisible({
        timeout: 30_000,
      });

      const user = await prisma.user.findUniqueOrThrow({
        where: { email },
        select: {
          id: true,
          emailVerified: true,
          ageConfirmedAt: true,
          autoScheduleSettings: { select: { userId: true } },
        },
      });
      expect(user.emailVerified).toBeNull();
      expect(user.ageConfirmedAt).not.toBeNull();
      expect(user.autoScheduleSettings?.userId).toBe(user.id);

      await expectNoHorizontalOverflow(page);

      const rawToken = `onboarding-token-${viewport}-${runId}`;
      const token = createHash("sha256").update(rawToken).digest("hex");
      await prisma.verificationToken.deleteMany({
        where: { identifier: email },
      });
      await prisma.verificationToken.create({
        data: {
          identifier: email,
          token,
          expires: addCalendarDays(newDate(), 1),
        },
      });
      await page.goto(
        `/auth/confirm-email?email=${encodeURIComponent(email)}&token=${encodeURIComponent(rawToken)}`
      );
      // The v3 page: confirm on a press, then say so and offer the way in.
      await page.getByRole("button", { name: "Confirm email" }).click();
      await page.getByRole("button", { name: "Continue to Needt" }).click();
      await page.waitForURL(/\/settings\?emailVerification=verified$/, {
        timeout: 30_000,
        waitUntil: "commit",
      });
      await expect
        .poll(async () =>
          prisma.trialGrant.count({ where: { userId: user.id } })
        )
        .toBe(1);
      //todo: walk the rest of first run on the v3 screens (empty states,
      // calendar connect from the Settings sheet, first scheduled task). The
      // old-design walk was removed with the old UI.
    });
  }
});
