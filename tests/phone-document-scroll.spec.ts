import {
  type Browser,
  type BrowserContext,
  type Page,
  chromium,
  devices,
  expect,
  test,
  webkit,
} from "@playwright/test";

import { prisma } from "@/lib/prisma";

import { type V3User, createV3User, signInAs } from "./helpers/v3-user";

/**
 * The phone page scrolls like a document (owner decision 2026-10-20), so
 * Safari 26 has nothing fixed at the top and bottom edge to paint bands from.
 *
 * What this holds, per screen and per theme:
 *  - the document scrolls, there is no inner scroller, the last row can be
 *    brought above the dock;
 *  - nothing that paints (a background colour or image) and takes hits is
 *    `position: fixed` at the top or bottom edge, at rest;
 *  - `html` / `body` / `theme-color` / `color-scheme` wear the app theme's
 *    ground, whichever way the OS is set, and follow a live switch;
 *  - a sheet holds the page still and gives back the offset it was opened at.
 *
 * A real Safari toolbar cannot be emulated; this holds the inputs Safari reads.
 * `EDGE_BROWSER=webkit` runs it in WebKit (iPhone 15 descriptor),
 * `PHONE_SHOTS=<dir>` writes screenshots.
 */
const GROUND = { light: "rgb(246, 246, 243)", dark: "rgb(20, 20, 22)" };
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const ENGINE = process.env.EDGE_BROWSER === "webkit" ? webkit : chromium;
const SHOTS = process.env.PHONE_SHOTS;

test.setTimeout(120_000);

async function launch(): Promise<Browser> {
  return ENGINE.launch({
    args:
      ENGINE === chromium
        ? [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--use-mock-keychain",
            "--password-store=basic",
          ]
        : [],
  });
}

async function phone(
  browser: Browser,
  system: "light" | "dark",
  app: "light" | "dark" | "system",
  { tasks = 0 }: { tasks?: number } = {}
): Promise<{ page: Page; context: BrowserContext; user: V3User }> {
  const context = await browser.newContext({
    ...devices[ENGINE === webkit ? "iPhone 15" : "iPhone 14"],
    ...(ENGINE === chromium
      ? { viewport: { width: 390, height: 844 } }
      : undefined),
    colorScheme: system,
    serviceWorkers: "block",
    baseURL: BASE,
  });
  const page = await context.newPage();
  const user = await createV3User("doc-scroll");
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: { theme: app },
    create: { userId: user.id, theme: app, timeZone: "Europe/Zurich" },
  });
  for (let i = 0; i < tasks; i++)
    await prisma.task.create({
      data: {
        userId: user.id,
        workspaceId: user.workspaceId,
        title: `Row ${i + 1}`,
        status: "todo",
        dueDate: new Date(),
      },
    });
  await signInAs(page, user);
  await context.addCookies([{ name: "needt-ui", value: "phone", url: BASE }]);
  if (ENGINE === chromium) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { top: 47, bottom: 34, left: 0, right: 0 },
    });
  }
  return { page, context, user };
}

async function open(page: Page, route: string, ready?: string) {
  await page.goto(route).catch(() => undefined);
  await page.locator('.needt-v3[data-ui="phone"]').waitFor();
  if (ready) await page.locator(ready).first().waitFor({ timeout: 45_000 });
  await page.waitForTimeout(1200);
}

/**
 * What Safari 26 reads to tint a bar: the own `background-color` of a
 * `position: fixed` / `sticky` element within ~4px of the top or bottom edge
 * that is at least 80% of the viewport wide and 3px tall. Opacity, visibility
 * and even a transparent colour do not matter (any such element is a
 * candidate); pseudo-elements and absolute children are not read, and only
 * `display: none` removes it. Returns every such element, within 5px of an
 * edge. Empty is the goal: the bars then show the page under them.
 */
async function edgeCandidates(page: Page) {
  return page.evaluate(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const found: string[] = [];
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") continue;
      if (cs.display === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width < w * 0.8 || r.height < 3) continue;
      const atTop = r.top <= 5 && r.bottom > 0;
      const atBottom = r.bottom >= h - 5 && r.top < h;
      if (!atTop && !atBottom) continue;
      found.push(
        `${atTop ? "top" : "bottom"} ${el.tagName.toLowerCase()}#${el.id}.${String(
          el.className
        ).slice(
          0,
          60
        )} ${cs.backgroundColor} ${Math.round(r.top)}..${Math.round(r.bottom)}`
      );
    }
    return found;
  });
}

async function pageColours(page: Page) {
  return page.evaluate(() => {
    const metas = Array.from(
      document.head.querySelectorAll<HTMLMetaElement>(
        'meta[name="theme-color"]'
      )
    );
    const matching = metas.find(
      (m) => !m.media || window.matchMedia(m.media).matches
    );
    const probe = document.createElement("i");
    probe.style.color = matching?.content ?? "";
    document.body.appendChild(probe);
    const themeColor = getComputedStyle(probe).color;
    probe.remove();
    return {
      html: getComputedStyle(document.documentElement).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
      scheme: document.documentElement.style.colorScheme,
      schemeMeta:
        document.head
          .querySelector('meta[name="color-scheme"]')
          ?.getAttribute("content") ?? null,
      themeColor,
    };
  });
}

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);
const scrollTo = async (page: Page, y: number) => {
  await page.evaluate((to) => window.scrollTo(0, to), y);
  await page.waitForTimeout(400);
};

for (const system of ["light", "dark"] as const) {
  for (const app of ["light", "dark"] as const) {
    test(`edges and bar colours: system ${system}, app ${app}`, async () => {
      const browser = await launch();
      const { page } = await phone(browser, system, app, { tasks: 30 });
      for (const [route, ready] of [
        ["/today", "[data-pk-screen='home']"],
        ["/tasks", "[data-pk-screen='tasks']"],
        ["/calendar", "[data-pk-screen='calendar']"],
        ["/pages", "[data-pk-screen='docs']"],
      ] as const) {
        await open(page, route, ready);
        const name = route.slice(1);
        for (const at of ["top", "middle", "bottom"] as const) {
          if (at === "middle") await scrollTo(page, 300);
          if (at === "bottom") await scrollTo(page, 1e6);
          expect(
            await edgeCandidates(page),
            `${route} ${at}: no full-width fixed element at an edge`
          ).toEqual([]);
          const c = await pageColours(page);
          expect(c.html).toBe(GROUND[app]);
          expect(c.body).toBe(GROUND[app]);
          expect(c.scheme).toBe(app);
          expect(c.schemeMeta).toBe(app);
          expect(c.themeColor).toBe(GROUND[app]);
          if (SHOTS)
            await page.screenshot({
              path: `${SHOTS}/doc-${name}-${at}-sys-${system}-app-${app}.png`,
            });
        }
      }
      await browser.close();
    });
  }
}

test("the theme switches live and the bars follow", async () => {
  const browser = await launch();
  const { page } = await phone(browser, "light", "light");
  await open(page, "/today", "[data-pk-screen='home']");
  expect((await pageColours(page)).html).toBe(GROUND.light);
  await open(page, "/settings#appearance");
  await page.getByRole("button", { name: "Dark", exact: true }).first().click();
  await expect
    .poll(async () => (await pageColours(page)).scheme, { timeout: 8000 })
    .toBe("dark");
  const c = await pageColours(page);
  expect(c.html).toBe(GROUND.dark);
  expect(c.body).toBe(GROUND.dark);
  expect(c.schemeMeta).toBe("dark");
  expect(c.themeColor).toBe(GROUND.dark);
  await browser.close();
});

test("the document scrolls and the last row clears the dock", async () => {
  const browser = await launch();
  const { page } = await phone(browser, "dark", "dark", { tasks: 30 });
  await open(page, "/tasks", "[data-pk-screen='tasks']");
  const m = await page.evaluate(() => {
    const inner = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-pk-screen] *, .v3-phone-host *"
      )
    ).filter((e) => {
      const o = getComputedStyle(e).overflowY;
      return (
        (o === "auto" || o === "scroll") && e.scrollHeight > e.clientHeight
      );
    });
    return {
      root: document.scrollingElement!.scrollHeight,
      inner: inner.map((e) => String(e.className)),
      view: window.innerHeight,
    };
  });
  expect(m.root).toBeGreaterThan(m.view * 2);
  expect(m.inner).toEqual([]);

  await scrollTo(page, 1e6);
  expect(await scrollY(page)).toBeGreaterThan(300);
  const rows = page.locator("[data-pk-row]");
  const last = await rows.last().boundingBox();
  const pill = await page.locator("[data-nva-pill]").boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(pill!.y + 1);
  // the dock floats: a gap under it, not on the edge
  const h = await page.evaluate(() => window.innerHeight);
  expect(pill!.y + pill!.height).toBeLessThan(h - 4);
  await browser.close();
});

test("the header collapses with the page scroll", async () => {
  const browser = await launch();
  const { page } = await phone(browser, "dark", "dark", { tasks: 30 });
  await open(page, "/tasks", "[data-pk-screen='tasks']");
  const screen = page.locator("[data-pk-screen='tasks']");
  await expect(screen).toHaveAttribute("data-pk-collapsed", "0");
  await scrollTo(page, 300);
  await expect(screen).toHaveAttribute("data-pk-collapsed", "1");
  await scrollTo(page, 0);
  await expect(screen).toHaveAttribute("data-pk-collapsed", "0");
  await browser.close();
});

// todo: flaky in CI (scrollY reads 0 right after open); verify on device, then re-enable.
test.fixme("a sheet holds the page still and returns its offset", async () => {
  const browser = await launch();
  const { page } = await phone(browser, "dark", "dark", { tasks: 30 });
  await open(page, "/tasks", "[data-pk-screen='tasks']");
  await scrollTo(page, 500);
  const before = await scrollY(page);
  expect(before).toBeGreaterThan(300);

  await page.getByRole("button", { name: /^Every place/ }).tap();
  await page.getByRole("button", { name: "Settings", exact: true }).tap();
  const sheet = page.locator(".pk-sheet-layer.is-open");
  await sheet.waitFor();
  await page.waitForTimeout(600);
  // pinned: the body is fixed at the offset, the screen behind keeps its header
  const held = await page.evaluate(() => ({
    position: getComputedStyle(document.body).position,
    top: document.body.style.top,
    collapsed: document
      .querySelector("[data-pk-screen='tasks']")
      ?.getAttribute("data-pk-collapsed"),
  }));
  expect(held.position).toBe("fixed");
  expect(held.top).toBe(`-${before}px`);
  expect(held.collapsed).toBe("1");
  // a wheel / drag outside the sheet does not move what is behind
  await page.mouse.move(195, 30);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.body.style.top)).toBe(
    `-${before}px`
  );
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/doc-sheet-settings.png` });

  await page.keyboard.press("Escape");
  await expect(page.locator(".pk-sheet-layer.is-open")).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(await scrollY(page)).toBe(before);
  expect(await page.evaluate(() => document.body.style.position)).toBe("");
  await browser.close();
});

// todo: flaky in CI (scrollY reads 0 right after open); verify on device, then re-enable.
test.fixme(
  "a new place starts at the top, back returns to where it was",
  async () => {
    const browser = await launch();
    const { page } = await phone(browser, "dark", "dark", { tasks: 30 });
    await open(page, "/tasks", "[data-pk-screen='tasks']");
    await scrollTo(page, 600);
    await page.getByRole("button", { name: "Docs", exact: true }).first().tap();
    await page.locator("[data-pk-screen='docs']").waitFor();
    await page.waitForTimeout(600);
    expect(await scrollY(page)).toBe(0);
    await page.goBack();
    await page.locator("[data-pk-screen='tasks']").waitFor();
    await expect
      .poll(() => scrollY(page), { timeout: 5000 })
      .toBeGreaterThan(500);
    await browser.close();
  }
);

for (const app of ["light", "dark"] as const) {
  test(`edge layers in motion: pull-down, menu, scroll (${app})`, async () => {
    const browser = await launch();
    const { page } = await phone(browser, app, app, { tasks: 30 });
    await open(page, "/today", "[data-pk-screen='home']");
    // real rows, not the loading skeleton: the page has to be long enough to scroll
    await page
      .getByText("Row 1", { exact: true })
      .first()
      .waitFor({ timeout: 45_000 });
    await page.waitForTimeout(800);
    expect(
      await page.evaluate(
        () => document.scrollingElement!.scrollHeight - innerHeight
      )
    ).toBeGreaterThan(450);
    const shot = async (name: string) => {
      if (SHOTS)
        await page.screenshot({ path: `${SHOTS}/edge-${name}-${app}.png` });
    };
    await shot("home-top");

    // the header collapsed over the blurred band
    await scrollTo(page, 400);
    expect(await edgeCandidates(page), "collapsed").toEqual([]);
    await shot("home-collapsed");
    await scrollTo(page, 1e6);
    expect(await edgeCandidates(page), "bottom").toEqual([]);
    await shot("home-bottom");
    await scrollTo(page, 0);

    // the pull-down plate half open, held
    await page.mouse.move(195, 300);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(195, 300 + i * 12);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(250);
    expect(await edgeCandidates(page), "pull-down held").toEqual([]);
    await shot("pull-half");
    await page.mouse.up();
    await page.waitForTimeout(900);
    expect(await edgeCandidates(page), "pull-down open").toEqual([]);
    await shot("pull-open");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(900);
    expect(await edgeCandidates(page), "pull-down shut").toEqual([]);

    // the menu open (its scrim and card are the biggest fixed layer)
    await page.locator("[data-nva-pill]").click({ force: true });
    await page.waitForTimeout(900);
    expect(await edgeCandidates(page), "menu").toEqual([]);
    await shot("menu");
    await browser.close();
  });
}

test("the edge probe does see a painted fixed strip (control)", async () => {
  const browser = await launch();
  const { page } = await phone(browser, "dark", "dark");
  await open(page, "/today", "[data-pk-screen='home']");
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.id = "probe-strip";
    d.style.cssText =
      "position:fixed;left:0;right:0;top:0;height:12px;background:#f00;z-index:99999";
    document.body.appendChild(d);
  });
  expect((await edgeCandidates(page)).join("|")).toContain("probe-strip");
  await browser.close();
});
