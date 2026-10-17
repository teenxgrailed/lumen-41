import { encode } from "next-auth/jwt";

import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";

if (!process.env.NEXTAUTH_SECRET && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const pageId = "page-e2e";
const pageDetail = {
  id: pageId,
  parentId: null,
  title: "Product brief",
  icon: null,
  coverUrl: null,
  isPrivate: false,
  isFavorite: false,
  updatedAt: "2026-08-06T10:00:00.000Z",
  database: null,
  children: [],
  blocks: [
    {
      id: "page-block-e2e",
      parentBlockId: null,
      type: "PARAGRAPH",
      content: {
        json: {
          type: "paragraph",
          attrs: { blockId: "page-block-e2e" },
        },
      },
      position: 1024,
      createdBy: "HUMAN",
    },
  ],
};

test("Pages supports workspace entities, tables, and version history", async ({
  page,
}) => {
  const secret = process.env.NEXTAUTH_SECRET;
  expect(secret, "NEXTAUTH_SECRET is required for Pages E2E").toBeTruthy();
  const token = await encode({
    secret: secret!,
    maxAge: 60 * 60,
    token: { sub: "pages-e2e-user", email: "pages-e2e@needt.local" },
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

  const entities: Array<{ type: string; title: string }> = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === `/api/pages/${pageId}` && request.method() === "GET") {
      await route.fulfill({ json: { page: pageDetail } });
      return;
    }
    if (url.pathname === `/api/pages/${pageId}/blocks`) {
      await route.fulfill({ json: { page: pageDetail } });
      return;
    }
    if (url.pathname === `/api/pages/${pageId}/collaboration-token`) {
      await route.fulfill({ status: 503, json: { error: "Unavailable" } });
      return;
    }
    if (url.pathname === `/api/pages/${pageId}/entities`) {
      const input = JSON.parse(request.postData() ?? "{}") as {
        type: string;
        title: string;
      };
      entities.push(input);
      await route.fulfill({
        status: 201,
        json: {
          entity: {
            type: input.type,
            id: "created-task",
            title: input.title,
            href: "/tasks?taskId=created-task",
          },
        },
      });
      return;
    }
    if (url.pathname === "/api/pages/search") {
      await route.fulfill({
        json: {
          pages: [
            {
              id: "linked-page",
              title: "Research notes",
              icon: null,
              updatedAt: "2026-08-06T10:00:00.000Z",
            },
          ],
        },
      });
      return;
    }
    if (url.pathname === `/api/pages/${pageId}/revisions`) {
      await route.fulfill({
        json: {
          revisions: [
            {
              id: "revision-e2e",
              createdAt: "2026-08-06T10:00:00.000Z",
              createdBy: "HUMAN",
            },
          ],
        },
      });
      return;
    }
    if (url.pathname === `/api/pages/${pageId}/backlinks`) {
      await route.fulfill({ json: { backlinks: [] } });
      return;
    }
    if (url.pathname === "/api/ai/page-proposals") {
      await route.fulfill({ json: { proposals: [] } });
      return;
    }
    await route.fulfill({ json: {} });
  });

  await page.goto(`/pages/${pageId}`, { waitUntil: "domcontentloaded" });
  const document = page.getByLabel("Page document");
  await expect(document).toBeVisible();
  await document.click();
  await page.keyboard.type("/task");
  await page.getByRole("menuitem", { name: /Task link/ }).click();
  await page
    .getByRole("textbox", { name: "Task title" })
    .fill("Publish workspace guide");
  await page.getByRole("button", { name: "Add block" }).click();
  await expect
    .poll(() => entities)
    .toEqual([{ type: "task", title: "Publish workspace guide" }]);
  const taskBlock = document.locator(
    '[data-needt-page-block="TASK_REFERENCE"]'
  );
  await expect(taskBlock).toHaveText("Publish workspace guide");
  await taskBlock.click();
  await page.keyboard.press("Backspace");
  await expect(taskBlock).toHaveCount(0);
  expect(entities).toEqual([
    { type: "task", title: "Publish workspace guide" },
  ]);

  await document.click();
  await page.keyboard.type("/table");
  await page.getByRole("menuitem", { name: /Table/ }).click();
  await expect(document.locator("table")).toBeVisible();

  await page.getByRole("button", { name: "Page options" }).click();
  await page.getByRole("button", { name: "Version history" }).click();
  await expect(
    page.getByText("Restoring a version keeps your current document")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();
});
