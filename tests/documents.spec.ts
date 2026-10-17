import { encode } from "next-auth/jwt";

import { type Page, expect, test } from "@playwright/test";
import { existsSync } from "node:fs";

if (!process.env.NEXTAUTH_SECRET && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const workspace = {
  id: "workspace-docs-e2e",
  name: "Docs workspace",
  kind: "PERSONAL",
  createdAt: "2026-09-01T00:00:00.000Z",
};

const document = {
  id: "page-e2e",
  title: "Launch brief",
  icon: null,
  meta: "Edited just now",
  collection: { id: "folder-1", name: "Launch", hue: "#d97706" },
  tags: [],
  lines: 5,
  pinned: false,
  isPrivate: false,
  isDatabase: false,
  canEdit: true,
  canTrash: true,
};

async function authenticate(page: Page) {
  const secret = process.env.NEXTAUTH_SECRET;
  expect(secret, "NEXTAUTH_SECRET is required for documents E2E").toBeTruthy();
  const token = await encode({
    secret: secret!,
    maxAge: 60 * 60,
    token: {
      sub: "docs-e2e-user",
      email: "docs-e2e@needt.local",
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

async function mockDocuments(page: Page, canEdit = true) {
  let favoritePayload: unknown;
  let createPayload: unknown;
  let pinned = false;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/auth/session") {
      return route.fulfill({
        json: {
          user: {
            id: "docs-e2e-user",
            email: "docs-e2e@needt.local",
            role: "admin",
          },
          expires: "2026-09-25T00:00:00.000Z",
        },
      });
    }
    if (url.pathname === "/api/workspaces") {
      return route.fulfill({
        json: {
          workspaces: [{ role: canEdit ? "OWNER" : "VIEWER", workspace }],
        },
      });
    }
    if (url.pathname === "/api/needt/docs") {
      const matches = !url.searchParams.get("q")?.includes("missing");
      return route.fulfill({
        json: {
          workspaceId: workspace.id,
          canCreate: canEdit,
          docs: matches
            ? [
                {
                  ...document,
                  pinned,
                  canEdit,
                  canTrash: canEdit,
                },
              ]
            : [],
          metadata: {
            folders: [{ id: "folder-1", name: "Launch", color: "#d97706" }],
            tags: [],
            smartFolders: [],
          },
        },
      });
    }
    if (
      url.pathname === `/api/pages/${document.id}` &&
      request.method() === "PATCH"
    ) {
      favoritePayload = JSON.parse(request.postData() ?? "{}");
      pinned = Boolean(
        (favoritePayload as { isFavorite?: boolean }).isFavorite
      );
      return route.fulfill({ json: { page: { id: document.id } } });
    }
    if (url.pathname === "/api/pages" && request.method() === "POST") {
      createPayload = JSON.parse(request.postData() ?? "{}");
      return route.fulfill({ json: { page: { id: "new-page-e2e" } } });
    }
    return route.fulfill({ json: [] });
  });

  return {
    favoritePayload: () => favoritePayload,
    createPayload: () => createPayload,
  };
}

//todo rewrite for the v3 UI: this drives the pre-v3 screen that was removed with the design_v3 flag branches.
test.fixme(
  "Documents searches, persists a favorite, opens, and creates",
  async ({ page }) => {
    await authenticate(page);
    const state = await mockDocuments(page);

    await page.goto("/pages");
    await expect(
      page.getByRole("heading", { name: "Documents", exact: true })
    ).toBeVisible();
    await expect(page.getByText(document.title)).toBeVisible();

    await page.getByLabel("Search documents").fill("missing");
    await expect(page.getByText("Nothing here yet.")).toBeVisible();
    await page.getByLabel("Search documents").fill("");
    await expect(page.getByText(document.title)).toBeVisible();

    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Star" }).click();
    await expect.poll(state.favoritePayload).toEqual({ isFavorite: true });
    // The shell's rail has a Pinned section of its own, so scope this to the
    // document list rather than the page.
    await expect(
      page.getByRole("main").getByText("Pinned").first()
    ).toBeVisible();

    // The editor's own endpoints are not mocked here, so it bounces back to the
    // list; watch for the navigation itself rather than the settled URL.
    const opened = page.waitForURL(new RegExp(`/pages/${document.id}$`));
    await page
      .getByRole("main")
      .getByRole("link", { name: `Open ${document.title}` })
      .first()
      .click();
    await opened;

    await page.goto("/pages");
    // The editor for a freshly created Page bounces back to the list because this
    // test does not mock the editor's own endpoints, so watch for the push itself.
    const created = page.waitForURL(/\/pages\/new-page-e2e$/);
    await page.getByRole("button", { name: "New document" }).click();
    await expect.poll(state.createPayload).toEqual({ title: "Untitled" });
    await created;
  }
);

for (const width of [360, 390]) {
  //todo rewrite for the v3 UI: this drives the pre-v3 screen that was removed with the design_v3 flag branches.
  test.fixme(
    `Documents stays read-only for a Viewer at ${width}px`,
    async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await authenticate(page);
      await mockDocuments(page, false);

      await page.goto("/pages");
      await expect(page.getByText(document.title)).toBeVisible();
      await expect(
        page.getByRole("button", { name: "New document" })
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "New database" })
      ).toHaveCount(0);
      await expect(page.getByLabel("New document organization")).toHaveCount(0);
      await page.getByRole("button", { name: "More" }).click();
      await expect(page.getByRole("menuitem", { name: "Star" })).toHaveCount(0);
      await expect(
        page.getByRole("menuitem", { name: "Move to trash" })
      ).toHaveCount(0);
    }
  );
}
