import {
  type Browser,
  type Page,
  type TestInfo,
  chromium,
  devices,
  expect,
  test,
} from "@playwright/test";

import { prisma } from "@/lib/prisma";

import { type V3User, createV3User, signInAs } from "./helpers/v3-user";

/**
 * Editing a document on the phone, with the keyboard up (owner, 2026-10-29:
 * Enter stacked two bars over the keyboard and pushed the header under the
 * status bar). What this holds, after every Enter:
 *  - exactly one of our bars shows, on the keyboard's top edge, never under it;
 *  - the caret line stays above that bar;
 *  - the reader's top chips stay below the status bar, crisp and tappable;
 *  - the block-type panel grows out of the same bar; the "/" sheet replaces it.
 *
 * A browser cannot raise a real iOS keyboard, so the visual viewport is made
 * to shrink by the keyboard's height (that is all iOS tells the page) and a
 * grey slab stands in for the keys in the screenshots. iOS 26's own "∧ ∨ ✓"
 * pill is not drawn here: it cannot be emulated, and the room the bar keeps
 * for it is held by bar-logic's unit tests.
 */
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const KEYBOARD = 336; // an iPhone's keyboard with its suggestion row
const LINES = 30;

test.setTimeout(150_000);

const FAKE_KEYBOARD = `(() => {
  const vv = window.visualViewport;
  if (!vv) return;
  const height = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(vv),
    "height"
  );
  let kb = 0;
  Object.defineProperty(vv, "height", {
    configurable: true,
    get: () => height.get.call(vv) - kb,
  });
  window.__needtKeyboard = (px) => {
    kb = px;
    let slab = document.getElementById("e2e-keyboard");
    if (!slab) {
      slab = document.createElement("div");
      slab.id = "e2e-keyboard";
      slab.style.cssText =
        "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;" +
        "pointer-events:none;background:rgba(120,120,128,0.55)";
      document.documentElement.appendChild(slab);
    }
    slab.style.height = px + "px";
    slab.style.display = px > 0 ? "block" : "none";
    vv.dispatchEvent(new Event("resize"));
  };
})();`;

async function seedDoc(user: V3User) {
  const doc = await prisma.page.create({
    data: {
      userId: user.id,
      workspaceId: user.workspaceId,
      title: "Phone notes",
      isPrivate: false,
    },
  });
  for (let i = 1; i <= LINES; i++)
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
  return doc;
}

async function phone(browser: Browser) {
  const context = await browser.newContext({
    ...devices["iPhone 14"],
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
    baseURL: BASE,
  });
  await context.addInitScript(FAKE_KEYBOARD);
  const page = await context.newPage();
  const user = await createV3User("doc-phone-edit");
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: { theme: "light" },
    create: { userId: user.id, theme: "light", timeZone: "Europe/Zurich" },
  });
  await signInAs(page, user);
  await context.addCookies([{ name: "needt-ui", value: "phone", url: BASE }]);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: 47, bottom: 34, left: 0, right: 0 },
  });
  return { page, context, user };
}

const setKeyboard = (page: Page, px: number) =>
  page.evaluate(
    (h) =>
      (
        window as unknown as { __needtKeyboard: (px: number) => void }
      ).__needtKeyboard(h),
    px
  );

/** Everything this spec measures, in one read. */
const geometry = (page: Page) =>
  page.evaluate(() => {
    const bars = Array.from(
      document.querySelectorAll<HTMLElement>(".needt-page-bar")
    ).filter((el) => {
      const cs = getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden";
    });
    const bar = bars[0]?.getBoundingClientRect() ?? null;
    const sel = window.getSelection();
    let caret: { top: number; bottom: number } | null = null;
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      const rect =
        range.getClientRects()[0] ??
        (range.startContainer instanceof Element
          ? range.startContainer
          : range.startContainer.parentElement
        )?.getBoundingClientRect();
      if (rect) caret = { top: rect.top, bottom: rect.bottom };
    }
    const back = document.querySelector<HTMLElement>("[data-pd-back]");
    const backRect = back?.getBoundingClientRect() ?? null;
    const hit = backRect
      ? document.elementFromPoint(
          backRect.left + backRect.width / 2,
          backRect.top + backRect.height / 2
        )
      : null;
    const vv = window.visualViewport!;
    const desktopMenu = document.querySelector<HTMLElement>(
      '[aria-label="Text formatting"]'
    );
    return {
      bars: bars.length,
      mode: bars[0]?.dataset.mode ?? null,
      bar: bar && { top: bar.top, bottom: bar.bottom },
      caret,
      vvBottom: vv.offsetTop + vv.height,
      back: backRect && { top: backRect.top, bottom: backRect.bottom },
      backTappable: !!(hit && back?.contains(hit)),
      desktopMenuShown:
        !!desktopMenu && getComputedStyle(desktopMenu).display !== "none",
    };
  });

async function shot(page: Page, info: TestInfo, name: string) {
  await info.attach(name, {
    body: await page.screenshot(),
    contentType: "image/png",
  });
}

test("phone doc: Enter keeps one bar on the keyboard, the caret and the header in sight", async ({
  browserName,
}, info) => {
  test.skip(browserName !== "chromium", "uses Chromium's safe-area override");
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const { page, user } = await phone(browser);
    const doc = await seedDoc(user);
    await page.goto(`/pages/${doc.id}`);
    const reader = page.locator("[data-pd-reader]");
    await expect(reader).toBeVisible({ timeout: 45_000 });
    const editor = reader.locator(".ProseMirror");
    await expect(editor).toContainText("Line 14");
    await page.waitForTimeout(800);

    // Tap a line that the keyboard is about to cover, then raise it.
    await editor.getByText("Line 14", { exact: true }).click();
    await setKeyboard(page, KEYBOARD);
    await page.waitForTimeout(500);
    await page.keyboard.press("End");

    const viewport = page.viewportSize()!;
    const keyboardTop = viewport.height - KEYBOARD;
    for (let i = 1; i <= 6; i++) {
      await page.keyboard.press("Enter");
      await page.keyboard.type(`Typed ${i}`);
      await page.waitForTimeout(250);
      const g = await geometry(page);
      expect(g.bars, `Enter ${i}: one bar`).toBe(1);
      expect(g.mode).toBe("bar");
      expect(g.desktopMenuShown).toBe(false);
      // on the keyboard's top edge: not under it, not floating far above
      expect(g.bar!.bottom).toBeLessThanOrEqual(keyboardTop + 1);
      expect(g.bar!.bottom).toBeGreaterThan(keyboardTop - 40);
      // the caret line above the bar
      expect(g.caret, `Enter ${i}: a caret`).not.toBeNull();
      expect(g.caret!.bottom).toBeLessThanOrEqual(g.bar!.top + 1);
      expect(g.caret!.top).toBeGreaterThanOrEqual(g.back!.bottom - 1);
      // the header below the status bar, and nothing over it
      expect(g.back!.top).toBeGreaterThanOrEqual(40);
      expect(g.backTappable, `Enter ${i}: Docs chip tappable`).toBe(true);
      if (i === 1 || i === 6) await shot(page, info, `enter-${i}`);
    }
    await expect(editor).toContainText("Typed 6");

    // The block-type panel opens out of the same bar.
    const bar = page.getByLabel("Page editing actions");
    await bar.getByRole("button", { name: "Block type" }).click();
    await expect(bar.getByRole("menu", { name: "Block type" })).toBeVisible();
    let g = await geometry(page);
    expect(g.bars).toBe(1);
    expect(g.mode).toBe("panel");
    expect(g.bar!.bottom).toBeLessThanOrEqual(keyboardTop + 1);
    await shot(page, info, "block-panel");
    await bar.getByRole("menuitemradio", { name: "Checklist" }).click();
    await expect(
      bar.getByRole("button", { name: "Checklist", exact: true })
    ).toHaveAttribute("aria-pressed", "true");
    g = await geometry(page);
    expect(g.mode).toBe("bar");

    // The "/" sheet takes the keyboard's top edge; the bar steps aside.
    // (Enter twice: a new checklist line, then out of the list.)
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/");
    await expect(
      page.getByRole("menu", { name: "Page commands" })
    ).toBeVisible();
    g = await geometry(page);
    expect(g.bars, "the / sheet, not the bar").toBe(0);
    await shot(page, info, "slash-sheet");
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("menu", { name: "Page commands" })
    ).toBeHidden();
    await expect.poll(async () => (await geometry(page)).bars).toBe(1);

    // ✓ puts the keyboard away and the bar with it.
    await bar.getByRole("button", { name: "Hide keyboard" }).click();
    await setKeyboard(page, 0);
    await expect.poll(async () => (await geometry(page)).bars).toBe(0);
    await shot(page, info, "done");
  } finally {
    await browser.close();
  }
});
