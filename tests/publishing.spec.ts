import { encode } from "next-auth/jwt";

import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";

import { consentCookieFor } from "./helpers/consent";

if (!process.env.NEXTAUTH_SECRET && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const pageId = "publishing-e2e";
const token = "public-page-e2e-token";
const pageDetail = {
  id: pageId,
  userId: "page-owner",
  workspaceId: null,
  parentId: null,
  title: "Public launch notes",
  icon: "📄",
  coverUrl: null,
  isPrivate: true,
  isFavorite: false,
  accessRole: "FULL_ACCESS",
  updatedAt: "2026-08-06T10:00:00.000Z",
  database: null,
  children: [],
  blocks: [
    {
      id: "public-block",
      parentBlockId: null,
      type: "PARAGRAPH",
      content: {
        json: {
          type: "paragraph",
          attrs: { blockId: "public-block" },
          content: [{ type: "text", text: "Published read-only content" }],
        },
      },
      position: 1024,
      createdBy: "HUMAN",
    },
  ],
};

test("publishes a read-only link and revokes an already open session", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const secret = process.env.NEXTAUTH_SECRET;
  expect(secret, "NEXTAUTH_SECRET is required").toBeTruthy();
  const session = await encode({
    secret: secret!,
    maxAge: 3600,
    token: { sub: "page-owner", email: "owner@needt.local" },
  });
  await page.context().addCookies([
    {
      name: "next-auth.session-token",
      value: session,
      url: process.env.TEST_BASE_URL ?? "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  let published = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === `/api/pages/${pageId}`) {
      await route.fulfill({ json: { page: pageDetail } });
      return;
    }
    if (url.pathname === `/api/pages/${pageId}/collaboration-token`) {
      await route.fulfill({ status: 503, json: { error: "Unavailable" } });
      return;
    }
    if (url.pathname === `/api/pages/${pageId}/permissions`) {
      await route.fulfill({ json: { ownerId: "page-owner", grants: [] } });
      return;
    }
    if (url.pathname === `/api/pages/${pageId}/publication`) {
      if (request.method() === "POST") published = true;
      await route.fulfill({
        json: {
          published,
          url: published ? `http://localhost:3000/p/${token}` : null,
        },
      });
      return;
    }
    if (url.pathname === `/api/public/pages/${token}`) {
      await route.fulfill({ json: { page: pageDetail } });
      return;
    }
    if (url.pathname === `/api/public/pages/${token}/events`) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      await route.fulfill({
        body: "event: revoked\ndata: {}\n\n",
        headers: {
          "Cache-Control": "no-cache",
          "Content-Type": "text/event-stream",
        },
      });
      return;
    }
    await route.fulfill({ json: {} });
  });

  await page.goto(`/pages/${pageId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Page options" }).click();
  await page.getByRole("button", { name: "Share & permissions" }).click();
  await page.getByRole("button", { name: "Publish Page" }).click();
  await expect(page.getByLabel("Published Page link")).toHaveValue(
    `http://localhost:3000/p/${token}`
  );

  await page.context().clearCookies();
  await page.context().addCookies([consentCookieFor("http://localhost:3000")]);
  await page.goto(`/p/${token}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Published read-only content")).toBeVisible();
  await expect(page.getByLabel("Published Page document")).toHaveAttribute(
    "contenteditable",
    "false"
  );
  await expect(
    page.getByText("This Page is no longer available")
  ).toBeVisible();
  await expect(page.getByText("Published read-only content")).toHaveCount(0);
});
