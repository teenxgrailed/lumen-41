import { encode } from "next-auth/jwt";

import { type Page, expect, test } from "@playwright/test";
import { existsSync } from "node:fs";

if (!process.env.NEXTAUTH_SECRET && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const moodboardId = "moodboard-e2e";
const moodboard = {
  id: moodboardId,
  title: "Launch direction",
  createdById: "moodboard-owner",
  updatedAt: "2026-08-08T10:00:00.000Z",
  accessRole: "FULL_ACCESS",
};

async function authenticate(page: Page) {
  const secret = process.env.NEXTAUTH_SECRET;
  expect(secret, "NEXTAUTH_SECRET is required for Moodboard E2E").toBeTruthy();
  const token = await encode({
    secret: secret!,
    maxAge: 60 * 60,
    token: { sub: "moodboard-owner", email: "moodboard@needt.local" },
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

async function mockMoodboardApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === `/api/moodboards/${moodboardId}`) {
      await route.fulfill({ json: { moodboard } });
      return;
    }
    if (url.pathname === `/api/moodboards/${moodboardId}/collaboration-token`) {
      await route.fulfill({ status: 503, json: { error: "Unavailable" } });
      return;
    }
    if (url.pathname === `/api/moodboards/${moodboardId}/snapshots`) {
      await route.fulfill({ json: { snapshots: [] } });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

//todo rewrite for the v3 UI: this drives the pre-v3 screen that was removed with the design_v3 flag branches.
test.fixme(
  "Moodboard provides a canvas and all export formats",
  async ({ page }) => {
    await authenticate(page);
    await mockMoodboardApi(page);
    await page.goto(`/moodboards/${moodboardId}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByText("Launch direction")).toBeVisible();
    await expect(page.locator(".excalidraw")).toBeVisible();
    for (const name of [
      "Export moodboard",
      "Export SVG",
      "Export Excalidraw file",
    ]) {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name }).click();
      await download;
    }
  }
);

//todo rewrite for the v3 UI: this drives the pre-v3 screen that was removed with the design_v3 flag branches.
test.fixme("Moodboard toolbar stays reachable at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await authenticate(page);
  await mockMoodboardApi(page);
  await page.goto(`/moodboards/${moodboardId}`, {
    waitUntil: "domcontentloaded",
  });

  for (const name of [
    "Open version history",
    "Export moodboard",
    "Export SVG",
    "Export Excalidraw file",
  ]) {
    const bounds = await page.getByRole("button", { name }).boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});
