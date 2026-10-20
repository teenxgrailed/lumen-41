import {
  type Page,
  chromium,
  devices,
  expect,
  test,
  webkit,
} from "@playwright/test";

import { prisma } from "@/lib/prisma";

import { createV3User, signInAs } from "./helpers/v3-user";

/**
 * The browser's own bars on the phone follow the in-app theme, not the system
 * appearance, and follow it live.
 *
 * Safari 26 ignores `theme-color` and tints its status bar and toolbar from the
 * element at the very top / bottom edge of the viewport (else the body colour).
 * So the elements at the two edges must be the theme's ground, whichever way
 * the OS is set: checked in all four system x app combinations, then through a
 * live switch from Settings. A real Safari toolbar cannot be emulated; this
 * holds the inputs it reads. `EDGE_BROWSER=webkit` runs it in WebKit (iPhone 15
 * descriptor), `PHONE_SHOTS=<dir>` writes the screenshots.
 */
const GROUND = { light: "rgb(246, 246, 243)", dark: "rgb(20, 20, 22)" };
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

async function readEdges(page: Page) {
  return page.evaluate(() => {
    const at = (y: number) => {
      const el = document.elementFromPoint(window.innerWidth / 2, y);
      return {
        cls: el?.className ?? "",
        bg: el ? getComputedStyle(el).backgroundColor : "",
      };
    };
    const metas = Array.from(
      document.head.querySelectorAll<HTMLMetaElement>(
        'meta[name="theme-color"]'
      )
    );
    const matching = metas.find(
      (m) => !m.media || window.matchMedia(m.media).matches
    );
    return {
      top: at(1),
      bottom: at(window.innerHeight - 1),
      html: getComputedStyle(document.documentElement).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
      scheme: document.documentElement.style.colorScheme,
      schemeMeta:
        document.head
          .querySelector('meta[name="color-scheme"]')
          ?.getAttribute("content") ?? null,
      themeColor: matching?.content ?? null,
    };
  });
}

/** rgb(r, g, b) or color(srgb r g b) as 0-255 channels, rounded. */
function channels(value: string): number[] {
  const n = (value.match(/[\d.]+/g) ?? []).map(Number);
  const srgb = value.startsWith("color(");
  return n.slice(0, 3).map((c) => Math.round(srgb ? c * 255 : c));
}

const rgbOfHex = (hex: string) => {
  if (!hex.startsWith("#")) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};

for (const system of ["light", "dark"] as const) {
  for (const app of ["light", "dark"] as const) {
    test(`bars follow the app theme: system ${system}, app ${app}`, async () => {
      const engine = process.env.EDGE_BROWSER === "webkit" ? webkit : chromium;
      const browser = await engine.launch({
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      });
      const context = await browser.newContext({
        ...devices[engine === webkit ? "iPhone 15" : "iPhone 14"],
        colorScheme: system,
        serviceWorkers: "block",
        baseURL: BASE,
      });
      const page = await context.newPage();
      const user = await createV3User("edge-tint");
      await prisma.userSettings.upsert({
        where: { userId: user.id },
        update: { theme: app },
        create: { userId: user.id, theme: app, timeZone: "Europe/Zurich" },
      });
      await signInAs(page, user);
      await context.addCookies([
        { name: "needt-ui", value: "phone", url: BASE },
      ]);
      await page.goto("/");
      await page.locator('.needt-v3[data-ui="phone"]').waitFor();
      await page.waitForTimeout(1500);

      const dir = process.env.PHONE_SHOTS;
      if (dir)
        await page.screenshot({
          path: `${dir}/edge-sys-${system}-app-${app}.png`,
        });

      const check = async (side: "light" | "dark") => {
        const e = await readEdges(page);
        expect(String(e.top.cls)).toContain("v3-edge-tint");
        expect(String(e.bottom.cls)).toContain("v3-edge-tint");
        expect(e.top.bg).toBe(GROUND[side]);
        expect(e.bottom.bg).toBe(GROUND[side]);
        expect(e.html).toBe(GROUND[side]);
        expect(e.body).toBe(GROUND[side]);
        expect(e.scheme).toBe(side);
        expect(e.schemeMeta).toBe(side);
        expect(e.themeColor && rgbOfHex(e.themeColor)).toBe(GROUND[side]);
      };
      await check(app);

      // Live: switch the theme from Settings, no reload.
      const other = app === "dark" ? "light" : "dark";
      // The sheet opens over Today: the address redirects, which Playwright
      // reports as an interrupted navigation.
      await page.goto("/settings#appearance").catch(() => undefined);
      await page.locator('.needt-v3[data-ui="phone"]').waitFor();
      await page.waitForTimeout(1500);
      await page
        .getByRole("button", {
          name: other === "dark" ? "Dark" : "Light",
          exact: true,
        })
        .first()
        .click();
      await expect
        .poll(async () => (await readEdges(page)).scheme, { timeout: 8000 })
        .toBe(other);
      await page.waitForTimeout(800);
      if (dir)
        await page.screenshot({
          path: `${dir}/edge-sys-${system}-app-${app}-to-${other}.png`,
        });
      // Live, sheet still open: its scrim dims the edges on purpose (a darker
      // or lighter ground of the NEW theme), and everything else already wears
      // the new theme, with no reload.
      const live = await readEdges(page);
      const [r] = channels(live.top.bg);
      expect(String(live.top.cls)).toContain("v3-edge-tint");
      expect(live.top.bg).toBe(live.bottom.bg);
      if (other === "light") expect(r).toBeGreaterThan(150);
      else expect(r).toBeLessThan(40);
      expect(live.scheme).toBe(other);
      expect(live.schemeMeta).toBe(other);
      expect(channels(live.themeColor ?? "")[0]).toBe(r);
      // And at rest, first paint of the other theme (saved, then reloaded).
      await prisma.userSettings.update({
        where: { userId: user.id },
        data: { theme: other },
      });
      await context.clearCookies({ name: "needt-look" });
      await page.goto("/").catch(() => undefined);
      await page.locator('.needt-v3[data-ui="phone"]').waitFor();
      await page.waitForTimeout(1500);
      await check(other);
      await browser.close();
    });
  }
}
