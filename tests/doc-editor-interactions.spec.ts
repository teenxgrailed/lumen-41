import { type Page, expect, test } from "@playwright/test";

import { prisma } from "@/lib/prisma";

import { type V3User, createV3User, signInAs } from "./helpers/v3-user";

/*
 * The opened document on the desktop, with a page long enough to scroll:
 *  - a click on the page does not move it (the sheet's box and the scroller's
 *    offset stay put, even a beat later, when a glide would show);
 *  - a row of the Insert tab inserts at the caret and scrolls at most as far
 *    as the new block needs, never to the end of the page;
 *  - a row dragged from the Insert tab onto the page lands between the blocks
 *    under the pointer, with a line showing where; Esc cancels.
 */

const LINES = 70;

async function seedLongDoc(user: V3User) {
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: { prefs: { docPanel: true } },
    create: {
      userId: user.id,
      theme: "light",
      timeZone: "Europe/Zurich",
      prefs: { docPanel: true },
    },
  });
  const doc = await prisma.page.create({
    data: {
      userId: user.id,
      workspaceId: user.workspaceId,
      title: "Buy-list",
      isPrivate: false,
    },
  });
  for (let i = 1; i <= LINES; i++) {
    await prisma.pageBlock.create({
      data: {
        pageId: doc.id,
        type: "PARAGRAPH",
        position: i * 1024,
        content: {
          json: {
            type: "paragraph",
            attrs: { blockId: `${doc.id}-b${i}` },
            content: [{ type: "text", text: `Line ${i}` }],
          },
        },
      },
    });
  }
  return doc;
}

async function open(page: Page) {
  const user = await createV3User("doc-interact");
  await signInAs(page, user);
  const doc = await seedLongDoc(user);
  await page.goto(`/pages/${doc.id}`);
  await expect(page.locator(".needt-page-editor")).toContainText("Line 1");
  await expect(page.locator('[data-insert-command="paragraph"]')).toBeVisible();
  return doc;
}

const scroller = (page: Page) => page.locator("[data-doc-page]");
const sheetBox = async (page: Page) =>
  (await page.locator("[data-doc-sheet]").boundingBox()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
const offset = (page: Page) =>
  scroller(page).evaluate((el) => (el as HTMLElement).scrollTop);

async function scrollTo(page: Page, top: number) {
  await scroller(page).evaluate((el, t) => {
    (el as HTMLElement).scrollTop = t;
  }, top);
  await page.waitForTimeout(150);
}

test("Doc: a click on the page does not move it", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __log: unknown[] };
    w.__log = [];
    const desc = (n: unknown) => {
      const el = n as HTMLElement;
      return el && el.tagName
        ? `${el.tagName}.${String(el.className).slice(0, 40)}`
        : String(n);
    };
    for (const name of ["scrollIntoView", "scrollTo", "scrollBy", "focus"]) {
      const proto = Element.prototype as unknown as Record<
        string,
        (...a: unknown[]) => unknown
      >;
      const orig = proto[name];
      proto[name] = function (this: unknown, ...a: unknown[]) {
        w.__log.push({
          api: name,
          on: desc(this),
          a: JSON.stringify(a).slice(0, 60),
          stack: String(new Error().stack).split("\n").slice(2, 5).join("|"),
        });
        return orig.apply(this, a);
      };
    }
    document.addEventListener(
      "scroll",
      (e) => {
        const t = e.target as HTMLElement;
        w.__log.push({
          scroll: desc(t),
          top: t.scrollTop,
          left: t.scrollLeft,
        });
      },
      true
    );
  });
  await open(page);
  await scrollTo(page, 600);

  const line = page.locator(".needt-page-editor p", { hasText: /^Line 20$/ });
  await expect(line).toBeVisible();
  const before = await sheetBox(page);
  const top = await offset(page);

  // Into the text, then into the gap under the title (the page's own ground).
  await page.evaluate(() => {
    (window as unknown as { __log: unknown[] }).__log.length = 0;
  });
  await line.click();
  await page.waitForTimeout(700);
  console.log(
    "DIAG " +
      JSON.stringify(
        await page.evaluate(
          () => (window as unknown as { __log: unknown[] }).__log
        )
      )
  );
  expect(await sheetBox(page)).toEqual(before);
  expect(Math.abs((await offset(page)) - top)).toBeLessThanOrEqual(1);

  await scrollTo(page, 0);
  const title = (await page
    .locator("[data-page-title]")
    .boundingBox()) as NonNullable<
    Awaited<ReturnType<ReturnType<Page["locator"]>["boundingBox"]>>
  >;
  const sheet = await sheetBox(page);
  await page.mouse.click(title.x + title.width / 2, title.y + title.height + 8);
  await page.waitForTimeout(700);
  expect(await sheetBox(page)).toEqual(sheet);
  expect(await offset(page)).toBeLessThanOrEqual(1);
});

test("Doc: an Insert row adds its block at the caret and keeps the page in place", async ({
  page,
}) => {
  await open(page);
  await scrollTo(page, 900);

  const line = page.locator(".needt-page-editor p", { hasText: /^Line 30$/ });
  await line.click();
  await page.waitForTimeout(300);
  const top = await offset(page);
  const before = await page.locator(".needt-page-editor > p").count();

  await page.locator('[data-insert-command="paragraph"]').click();
  await page.waitForTimeout(700);

  expect(await page.locator(".needt-page-editor > p").count()).toBe(before + 1);
  // The new paragraph is right after the one the caret was in.
  await expect(
    page.locator(".needt-page-editor > p", { hasText: /^Line 30$/ })
  ).toBeVisible();
  expect(Math.abs((await offset(page)) - top)).toBeLessThanOrEqual(60);

  // Without a caret placed the block goes to what is on screen, not the end.
  await page.reload();
  await expect(page.locator(".needt-page-editor")).toContainText("Line 1");
  await scrollTo(page, 600);
  const rest = await offset(page);
  await page.locator('[data-insert-command="heading2"]').click();
  await page.waitForTimeout(700);
  await expect(page.locator(".needt-page-editor > h2")).toHaveCount(1);
  expect(Math.abs((await offset(page)) - rest)).toBeLessThanOrEqual(60);
});

test("Doc: a row dragged from the Insert tab lands between the blocks and Esc cancels", async ({
  page,
}) => {
  await open(page);
  const row = page.locator('[data-insert-command="heading1"]');
  const rowBox = (await row.boundingBox()) as NonNullable<
    Awaited<ReturnType<typeof row.boundingBox>>
  >;

  const l3 = (await page
    .locator(".needt-page-editor > p", { hasText: /^Line 3$/ })
    .boundingBox()) as { y: number; height: number };
  const l4 = (await page
    .locator(".needt-page-editor > p", { hasText: /^Line 4$/ })
    .boundingBox()) as { y: number; height: number };
  const gap = (l3.y + l3.height + l4.y) / 2;
  const sheet = await sheetBox(page);
  const x = sheet.x + sheet.width / 2;

  // Cancel first: the line shows, Esc takes it away, nothing is inserted.
  await page.mouse.move(rowBox.x + 20, rowBox.y + rowBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, gap, { steps: 12 });
  await expect(page.locator("[data-insert-drop-line]")).toBeVisible();
  await expect(page.locator("[data-insert-ghost]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-insert-drop-line]")).toHaveCount(0);
  await expect(page.locator("[data-insert-ghost]")).toHaveCount(0);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(page.locator(".needt-page-editor > h1")).toHaveCount(0);

  // Then drop it between Line 3 and Line 4.
  await page.mouse.move(rowBox.x + 20, rowBox.y + rowBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, gap, { steps: 12 });
  await expect(page.locator("[data-insert-drop-line]")).toHaveAttribute(
    "data-index",
    "3"
  );
  await page.mouse.up();

  const kids = page.locator(".needt-page-editor > *");
  await expect(page.locator(".needt-page-editor > h1")).toHaveCount(1);
  expect(
    await kids.evaluateAll((els) => els.slice(0, 5).map((e) => e.tagName))
  ).toEqual(["P", "P", "P", "H1", "P"]);
  await expect(kids.nth(2)).toHaveText("Line 3");
  await expect(kids.nth(4)).toHaveText("Line 4");
});
