import { encode } from "next-auth/jwt";

import { type Page, expect, test } from "@playwright/test";
import { existsSync } from "node:fs";

if (!process.env.NEXTAUTH_SECRET && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

async function authenticate(page: Page) {
  const secret = process.env.NEXTAUTH_SECRET;
  expect(secret, "NEXTAUTH_SECRET is required for settings E2E").toBeTruthy();
  const token = await encode({
    secret: secret!,
    maxAge: 60 * 60,
    token: {
      sub: "settings-e2e-user",
      name: "Settings Owner",
      email: "settings-e2e@needt.local",
      role: "admin",
    },
  });
  await page.context().addCookies([
    {
      name: "next-auth.session-token",
      value: token,
      url: process.env.TEST_BASE_URL ?? "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

const usage = {
  allowed: true,
  limit: null,
  used: 0,
  remaining: null,
  upgradeRequired: false,
  plan: "PRO",
};

async function mockSettings(page: Page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (pathname === "/api/auth/session") {
      return route.fulfill({
        json: {
          user: {
            id: "settings-e2e-user",
            name: "Settings Owner",
            email: "settings-e2e@needt.local",
            role: "admin",
          },
          expires: "2026-09-25T00:00:00.000Z",
        },
      });
    }
    if (pathname === "/api/workspaces") {
      return route.fulfill({
        json: {
          workspaces: [
            {
              role: "OWNER",
              workspace: {
                id: "settings-workspace",
                name: "Personal",
                kind: "PERSONAL",
                createdAt: "2026-09-01T00:00:00.000Z",
              },
            },
          ],
        },
      });
    }
    if (["/api/tasks", "/api/tags", "/api/projects"].includes(pathname)) {
      return route.fulfill({ json: [] });
    }
    if (pathname === "/api/user-settings") {
      return route.fulfill({
        json: {
          theme: "paper",
          defaultView: "week",
          timeZone: "Europe/Zurich",
          secondaryTimeZone: null,
          weekStartDay: "monday",
          timeFormat: "24h",
        },
      });
    }
    if (pathname === "/api/calendar-settings") {
      return route.fulfill({
        json: {
          defaultCalendarId: null,
          workingHoursEnabled: true,
          workingHoursStart: "09:00",
          workingHoursEnd: "17:00",
          workingHoursDays: "[1,2,3,4,5]",
          defaultDuration: 60,
          defaultColor: "#6366F1",
          defaultReminder: 30,
          refreshInterval: 5,
        },
      });
    }
    if (pathname === "/api/notification-settings") {
      return route.fulfill({
        json: {
          emailNotifications: true,
          dailyEmailEnabled: true,
          eventInvites: true,
          eventUpdates: true,
          eventCancellations: true,
          eventReminders: true,
          defaultReminderTiming: "[30]",
        },
      });
    }
    if (pathname === "/api/integration-settings") {
      return route.fulfill({
        json: {
          googleCalendarEnabled: true,
          googleCalendarAutoSync: true,
          googleCalendarInterval: 5,
          outlookCalendarEnabled: true,
          outlookCalendarAutoSync: true,
          outlookCalendarInterval: 5,
        },
      });
    }
    if (pathname === "/api/data-settings") {
      return route.fulfill({
        json: { autoBackup: true, backupInterval: 7, retainDataFor: 365 },
      });
    }
    if (pathname === "/api/auto-schedule-settings") {
      return route.fulfill({
        json: {
          workDays: "[1,2,3,4,5]",
          workHourStart: 9,
          workHourEnd: 18,
          selectedCalendars: "[]",
          bufferMinutes: 15,
          highEnergyStart: 9,
          highEnergyEnd: 12,
          mediumEnergyStart: 13,
          mediumEnergyEnd: 15,
          lowEnergyStart: 15,
          lowEnergyEnd: 18,
          groupByProject: false,
        },
      });
    }
    if (pathname === "/api/system-settings") {
      return route.fulfill({
        json: { logLevel: "none", logDestination: "db" },
      });
    }
    if (pathname === "/api/accounts") {
      return route.fulfill({ json: [] });
    }
    if (pathname === "/api/customization") {
      return route.fulfill({ json: {} });
    }
    if (pathname === "/api/onboarding") {
      return route.fulfill({
        json: {
          steps: [
            { id: "account", complete: true },
            { id: "calendar", complete: true },
            { id: "workspace", complete: true },
            { id: "task", complete: true },
          ],
        },
      });
    }
    if (pathname === "/api/billing") {
      return route.fulfill({
        json: {
          configured: true,
          plan: "PRO",
          isTrial: true,
          trialEndsAt: "2026-10-08T00:00:00.000Z",
          status: "ACTIVE",
          interval: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          canManageBilling: false,
          usage: {
            calendars: usage,
            autoScheduledTasks: usage,
            boards: usage,
            mailboxes: usage,
            aiActions: {
              used: 17,
              limit: 20,
              remaining: 3,
              allowed: true,
              plan: "PRO",
            },
          },
        },
      });
    }
    if (pathname === "/api/connector-settings") {
      return route.fulfill({
        json: {
          hasToken: false,
          tokenPreview: null,
          webhookUrl: null,
          webhookSchedule: false,
          webhookTaskComplete: false,
        },
      });
    }
    if (pathname === "/api/ai-settings") {
      return route.fulfill({
        json: {
          provider: "NONE",
          hasApiKey: false,
          customUrl: null,
          model: null,
          soulPreset: "business",
          allowParseTasks: true,
          allowReorder: false,
          allowSuggestEnergy: true,
          allowFullAuto: false,
          requestTimeoutSeconds: 20,
          usage: { used: 17, limit: 20, remaining: 3, allowed: true },
          oauth: { available: false, connected: false, expiresAt: null },
        },
      });
    }
    if (pathname === "/api/ai/memories") {
      return route.fulfill({ json: { memories: [] } });
    }
    if (request.method() !== "GET") {
      return route.fulfill({ json: {} });
    }
    return route.fulfill({ json: {} });
  });
}

//todo rewrite for the v3 UI: this drives the pre-v3 screen that was removed with the design_v3 flag branches.
test.fixme(
  "Settings keeps real account billing behind the ported navigation",
  async ({ page }) => {
    await authenticate(page);
    await mockSettings(page);

    await page.goto("/settings#theme");
    await expect(
      page.getByRole("heading", { name: "Appearance" })
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: "Account" })
      .click();

    await expect(page).toHaveURL(/#account$/);
    await expect(
      page.getByRole("heading", { name: "Account", exact: true })
    ).toBeVisible();
    await expect(page.getByText("Trial", { exact: true })).toBeVisible();
    await expect(page.getByText(/Pro trial ends/)).toBeVisible();
    await expect(page.getByText("$7/month", { exact: true })).toBeVisible();
    await expect(page.getByText("$149 once", { exact: true })).toBeVisible();
    await expect(page.getByText("Hosted AI actions this month")).toHaveCount(0);

    await page.getByRole("button", { name: "Yearly · 29% off" }).click();
    await expect(page.getByText("$59/year", { exact: true })).toBeVisible();
    await expect(
      page.getByText("$4.92/month billed annually", { exact: true })
    ).toBeVisible();
  }
);

for (const width of [360, 390]) {
  //todo rewrite for the v3 UI: this drives the pre-v3 screen that was removed with the design_v3 flag branches.
  test.fixme(
    `Settings changes sections without horizontal overflow at ${width}px`,
    async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await authenticate(page);
      await mockSettings(page);

      await page.goto("/settings#theme");
      await page.getByRole("combobox", { name: "Settings section" }).click();
      await page.getByRole("option", { name: "Data" }).click();
      await expect(page).toHaveURL(/#data$/);
      await expect(page.getByRole("heading", { name: "Data" })).toBeVisible();
      await expect(
        page.getByText("Personal API", { exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Provider", exact: true })
      ).toBeVisible();
      await expect(page.getByText(/\d+\/\d+ actions left/)).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true);
    }
  );
}
