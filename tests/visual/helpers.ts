import { encode } from "next-auth/jwt";

import { expect } from "@playwright/test";

import { prisma } from "@/lib/prisma";

import {
  VISUAL_TEST_EMAIL,
  VISUAL_TEST_NOW,
  VISUAL_TEST_PAGE_ID,
} from "./fixtures";
import { resetVisualSettings, resetVisualTaskData } from "./global-setup";

/**
 * The ported screens print the server's clock, which `page.clock` cannot
 * freeze, so a screenshot of Today or Calendar would otherwise carry the day
 * it was taken and drift the next morning. Rewrite that one field.
 */
export async function freezeNeedtNow(page: import("@playwright/test").Page) {
  const screens = ["today", "calendar", "workspace", "docs"];
  for (const screen of screens) {
    await page.route(`**/api/needt/${screen}`, async (route) => {
      try {
        const response = await route.fetch();
        if (!response.ok()) return route.fulfill({ response });
        const body = (await response.json()) as Record<string, unknown>;
        if (typeof body?.now === "string") body.now = VISUAL_TEST_NOW;
        if (typeof body?.todayKey === "string") {
          body.todayKey = VISUAL_TEST_NOW.slice(0, 10);
        }
        await route.fulfill({ response, json: body });
      } catch {
        // A screen that cannot be rewritten is still better served live than
        // left hanging on an aborted request.
        await route.continue();
      }
    });
  }
}

export async function signInVisualUser(page: import("@playwright/test").Page) {
  await freezeNeedtNow(page);
  await page.addInitScript(() => {
    sessionStorage.setItem("needt-ai-companion-intro-seen", "1");
  });
  const user = await prisma.user.findUnique({
    where: { email: VISUAL_TEST_EMAIL },
    select: { id: true },
  });
  expect(user).toBeTruthy();
  const workspace = await prisma.workspace.findUnique({
    where: { personalOwnerId: user!.id },
    select: { id: true },
  });
  expect(workspace).toBeTruthy();
  await Promise.all([
    prisma.dailyAgenda.deleteMany({ where: { userId: user!.id } }),
    prisma.focusSession.deleteMany({ where: { userId: user!.id } }),
    prisma.page.deleteMany({
      where: { userId: user!.id, id: { not: VISUAL_TEST_PAGE_ID } },
    }),
    resetVisualSettings(user!.id),
  ]);
  await resetVisualTaskData(user!.id, workspace!.id);

  // Visual specs authenticate a fixed test fixture directly. Repeatedly
  // exercising the credentials endpoint here would correctly trigger the
  // production account limiter and make screenshot coverage order-dependent;
  // credentials/rate-limit behavior is covered by the API E2E suite.
  const token = await encode({
    secret: process.env.NEXTAUTH_SECRET ?? "needt-visual-regression-secret",
    maxAge: 60 * 60,
    token: {
      sub: user!.id,
      email: VISUAL_TEST_EMAIL,
      name: "Visual QA",
      role: "admin",
    },
  });
  await page.context().addCookies([
    {
      name: "next-auth.session-token",
      value: token,
      url: process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
