import { encode } from "next-auth/jwt";

import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";

if (!process.env.NEXTAUTH_SECRET && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const pageId = "pages-mobile-e2e";
const pageDetail = {
  id: pageId,
  userId: "page-owner",
  workspaceId: null,
  parentId: null,
  title: "Mobile editor",
  icon: "📱",
  coverUrl: null,
  isPrivate: true,
  isFavorite: false,
  accessRole: "FULL_ACCESS",
  updatedAt: "2026-08-06T10:00:00.000Z",
  database: null,
  children: [],
  blocks: [
    {
      id: "mobile-one",
      parentBlockId: null,
      type: "PARAGRAPH",
      content: {
        json: {
          type: "paragraph",
          attrs: { blockId: "mobile-one" },
          content: [{ type: "text", text: "First mobile block" }],
        },
      },
      position: 1024,
      createdBy: "HUMAN",
    },
    {
      id: "mobile-two",
      parentBlockId: null,
      type: "PARAGRAPH",
      content: {
        json: {
          type: "paragraph",
          attrs: { blockId: "mobile-two" },
          content: [{ type: "text", text: "Second mobile block" }],
        },
      },
      position: 2048,
      createdBy: "HUMAN",
    },
    {
      id: "mobile-empty",
      parentBlockId: null,
      type: "PARAGRAPH",
      content: {
        json: {
          type: "paragraph",
          attrs: { blockId: "mobile-empty" },
        },
      },
      position: 3072,
      createdBy: "HUMAN",
    },
  ],
};

const viewports = [
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "768", width: 768, height: 900 },
];

for (const viewport of viewports) {
  test(`mobile Page controls stay usable at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
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
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === `/api/pages/${pageId}`) {
        await route.fulfill({ json: { page: pageDetail } });
        return;
      }
      if (url.pathname === `/api/pages/${pageId}/collaboration-token`) {
        await route.fulfill({ status: 503, json: { error: "Unavailable" } });
        return;
      }
      await route.fulfill({ json: {} });
    });

    await page.goto(`/pages/${pageId}`, { waitUntil: "domcontentloaded" });
    const firstBlock = page.locator('[data-block-id="mobile-one"]');
    const firstBounds = await firstBlock.boundingBox();
    expect(firstBounds).not.toBeNull();
    // The grip opens from a long press in the gutter left of the text, never
    // from one on the text (that is how a word is selected).
    const textPoint = {
      clientX: firstBounds!.x + 20,
      clientY: firstBounds!.y + firstBounds!.height / 2,
    };
    await firstBlock.dispatchEvent("pointerdown", {
      ...textPoint,
      isPrimary: true,
      pointerId: 9,
      pointerType: "touch",
    });
    await page.waitForTimeout(380);
    await expect(page.getByRole("button", { name: "Drag block" })).toHaveCount(
      0
    );
    await firstBlock.dispatchEvent("pointerup", {
      ...textPoint,
      isPrimary: true,
      pointerId: 9,
      pointerType: "touch",
    });
    const editorLeft = (await page.locator(".ProseMirror").boundingBox())!.x;
    const gutter = page
      .locator("main")
      .filter({ has: page.locator(".ProseMirror") })
      .first();
    const point = {
      clientX: editorLeft - 10,
      clientY: firstBounds!.y + firstBounds!.height / 2,
    };

    await gutter.dispatchEvent("pointerdown", {
      ...point,
      isPrimary: true,
      pointerId: 10,
      pointerType: "touch",
    });
    await gutter.dispatchEvent("pointermove", {
      clientX: point.clientX,
      clientY: point.clientY + 20,
      isPrimary: true,
      pointerId: 10,
      pointerType: "touch",
    });
    await page.waitForTimeout(380);
    await expect(page.getByRole("button", { name: "Drag block" })).toHaveCount(
      0
    );
    await gutter.dispatchEvent("pointerup", {
      ...point,
      isPrimary: true,
      pointerId: 10,
      pointerType: "touch",
    });

    await gutter.dispatchEvent("pointerdown", {
      ...point,
      isPrimary: true,
      pointerId: 11,
      pointerType: "touch",
    });
    await page.waitForTimeout(380);
    const dragHandle = page.getByRole("button", { name: "Drag block" });
    await expect(dragHandle).toBeVisible();
    await gutter.dispatchEvent("pointerup", {
      ...point,
      isPrimary: true,
      pointerId: 11,
      pointerType: "touch",
    });
    const handleBounds = await dragHandle.boundingBox();
    const secondBounds = await page
      .locator('[data-block-id="mobile-two"]')
      .boundingBox();
    expect(handleBounds).not.toBeNull();
    expect(secondBounds).not.toBeNull();
    const handlePoint = {
      clientX: handleBounds!.x + handleBounds!.width / 2,
      clientY: handleBounds!.y + handleBounds!.height / 2,
    };
    const dropY = secondBounds!.y + secondBounds!.height;
    await dragHandle.dispatchEvent("pointerdown", {
      ...handlePoint,
      isPrimary: true,
      pointerId: 12,
      pointerType: "touch",
    });
    await dragHandle.dispatchEvent("pointermove", {
      clientX: handlePoint.clientX,
      clientY: dropY,
      isPrimary: true,
      pointerId: 12,
      pointerType: "touch",
    });
    await dragHandle.dispatchEvent("pointerup", {
      clientX: handlePoint.clientX,
      clientY: dropY,
      isPrimary: true,
      pointerId: 12,
      pointerType: "touch",
    });
    await expect
      .poll(() =>
        page
          .locator(".ProseMirror > [data-block-id]")
          .evaluateAll((blocks) =>
            blocks.slice(0, 2).map((block) => block.textContent)
          )
      )
      .toEqual(["Second mobile block", "First mobile block"]);

    const selectionBlock = page.locator('[data-block-id="mobile-two"]');
    // The bar belongs to the focused editor: focus it first.
    await selectionBlock.click();
    const selectionBounds = await selectionBlock.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
      const bounds = range.getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom };
    });
    if (viewport.width < 640) {
      await expect(page.getByLabel("Page editing actions")).toBeVisible();
      await page
        .getByLabel("Page editing actions")
        .getByRole("button", { name: "Bold" })
        .click();
      await expect(selectionBlock.locator("strong")).toContainText(
        "Second mobile block"
      );
    } else {
      const formatting = page.locator('[aria-label="Text formatting"]');
      await expect(formatting).toBeVisible();
      const formattingBounds = await formatting.boundingBox();
      expect(formattingBounds).not.toBeNull();
      const toolbarDoesNotOverlap =
        formattingBounds!.y + formattingBounds!.height <=
          selectionBounds.top + 1 ||
        formattingBounds!.y >= selectionBounds.bottom - 1;
      expect(toolbarDoesNotOverlap).toBe(true);
    }

    const emptyBlock = page.locator('[data-block-id="mobile-empty"]');
    await emptyBlock.click();
    await page.keyboard.type("/");
    const commandMenu = page.getByRole("menu", { name: "Page commands" });
    await expect(commandMenu).toBeVisible();
    const commandBounds = await commandMenu.boundingBox();
    expect(commandBounds).not.toBeNull();
    expect(commandBounds!.x).toBeGreaterThanOrEqual(0);
    expect(commandBounds!.x + commandBounds!.width).toBeLessThanOrEqual(
      viewport.width + 1
    );
    if (viewport.width < 640) {
      expect(commandBounds!.y + commandBounds!.height).toBeCloseTo(
        viewport.height,
        0
      );
    } else {
      expect(commandBounds!.width).toBeCloseTo(320, 0);
    }
  });
}
