import {
  type Browser,
  type Page,
  chromium,
  expect,
  test,
  webkit,
} from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { prisma } from "@/lib/prisma";

import { createV3User, signInAs } from "./helpers/v3-user";

/**
 * The native Mac app (apps/macos) is a WKWebView on use.needt.app. Its bridge
 * script sets `window.__needtNative`, `window.__needtDesktop` and a
 * `window.__TAURI__` shim at document start, and the page then marks
 * `html[data-desktop="mac"][data-desktop-shell="swift"]`.
 *
 * This simulates that shell at 1440x900, light and dark, in Chromium and in
 * WebKit (the closest engine to WKWebView CI has), and holds:
 *  - the window is the frame: scrolling the main pane (wheel, and every
 *    programmatic way a focus or scrollIntoView can move an overflow:hidden
 *    container) leaves the document, the scope and the frame still, the top
 *    bar visible, and the sidebar's top at the same y (never under the
 *    traffic lights, y < 52);
 *  - no ghost: nothing empty and rounded floats where the Ask pill is, the
 *    shade behind the pill is exactly the pill's box;
 *  - "Ask Needt" is visible, inside the window and on top.
 *
 * `DESKTOP_SHOTS=<dir>` (default `desktop-shots/`) receives the screenshots;
 * CI uploads that folder whether the run passed or not.
 */
const SHOTS = process.env.DESKTOP_SHOTS || "desktop-shots";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const TOP_BAR = 52;

test.setTimeout(180_000);

const ENGINES = [
  { name: "chromium", type: chromium },
  { name: "webkit", type: webkit },
] as const;

async function launch(type: (typeof ENGINES)[number]["type"]) {
  return type.launch({
    args: type === chromium ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
  });
}

/** What apps/macos/Needt/Sources/WebBridge.swift defines before the page runs. */
function swiftBridge() {
  const w = window as unknown as Record<string, unknown>;
  w.__needtNative = { platform: "mac-swift" };
  w.__needtDesktop = {
    platform: "mac",
    vibrancy: false,
    home: "/today",
    dispatch() {},
    setHandler() {},
  };
  w.__TAURI__ = {
    event: { emit: () => Promise.resolve(null) },
    notification: {
      isPermissionGranted: () => Promise.resolve(false),
      requestPermission: () => Promise.resolve("default"),
      sendNotification() {},
    },
  };
}

async function openToday(
  browser: Browser,
  scheme: "light" | "dark",
  viewport: { width: number; height: number; dpr?: number } = {
    width: 1440,
    height: 900,
  }
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.dpr ?? 1,
    colorScheme: scheme,
    serviceWorkers: "block",
    baseURL: BASE,
  });
  await context.addInitScript(swiftBridge);
  const page = await context.newPage();
  const user = await createV3User("swift-shell");
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: { theme: scheme },
    create: { userId: user.id, theme: scheme, timeZone: "Europe/Zurich" },
  });
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      workspaceId: user.workspaceId,
      name: "Launch",
    },
  });
  for (let i = 0; i < 24; i++) {
    await prisma.task.create({
      data: {
        userId: user.id,
        workspaceId: user.workspaceId,
        projectId: i % 2 ? project.id : null,
        title: `Swift shell row ${i + 1}`,
        status: "todo",
        dueDate: new Date(),
      },
    });
  }
  await signInAs(page, user);
  await page.goto("/today").catch(() => undefined);
  await page
    .locator('html[data-desktop-shell="swift"] .needt-v3[data-ui="desktop"]')
    .waitFor({ timeout: 60_000 });
  await page.locator(".tab-bar").first().waitFor({ timeout: 60_000 });
  await page.locator("[data-chat-pill]").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  return { page, close: () => context.close() };
}

type Frame = {
  doc: number;
  scope: number[];
  topBar: { top: number; height: number; bottom: number };
  rail: { top: number } | null;
};

/** Everything that must not move. */
async function frame(page: Page): Promise<Frame> {
  return page.evaluate(() => {
    const scope = document.querySelector<HTMLElement>(".needt-v3");
    const bar = document.querySelector<HTMLElement>(".tab-bar");
    const rail = document.querySelector<HTMLElement>(".shell-app-row-2");
    const chain = [
      scope,
      scope?.querySelector<HTMLElement>(".app"),
      document.querySelector<HTMLElement>(".shell-app-row"),
      document.querySelector<HTMLElement>(".shell-app-stack"),
    ];
    const b = bar?.getBoundingClientRect();
    const s = scope?.getBoundingClientRect();
    return {
      doc: Math.max(
        document.scrollingElement?.scrollTop ?? 0,
        window.scrollY,
        document.body.scrollTop
      ),
      scope: [
        ...chain.map((el) => el?.scrollTop ?? 0),
        Math.round(s?.top ?? -1),
        Math.round(s?.height ?? -1),
      ],
      topBar: {
        top: Math.round(b?.top ?? -1),
        height: Math.round(b?.height ?? -1),
        bottom: Math.round(b?.bottom ?? -1),
      },
      rail: rail ? { top: Math.round(rail.getBoundingClientRect().top) } : null,
    };
  });
}

/** Every way a page gets moved that is not the person scrolling a pane. */
async function pushFrame(page: Page) {
  await page.evaluate(() => {
    const els = [
      document.scrollingElement,
      document.body,
      document.querySelector(".needt-v3"),
      document.querySelector(".needt-v3 .app"),
      document.querySelector(".shell-app-row"),
      document.querySelector(".shell-app-stack"),
    ];
    for (const el of els) {
      if (el) (el as HTMLElement).scrollTop = 120;
    }
    window.scrollTo(0, 120);
    document
      .querySelector(".shell-app-stack")
      ?.lastElementChild?.scrollIntoView?.({ block: "end" });
    document.querySelector("[data-chat-pill]")?.scrollIntoView?.();
  });
}

/** The pane that scrolls on the page: the tallest scroller inside the stack. */
async function scrollMainPane(page: Page) {
  const box = await page.evaluate(() => {
    const stack = document.querySelector(".shell-app-stack");
    if (!stack) return null;
    let best: { el: Element; room: number } | null = null;
    for (const el of Array.from(stack.querySelectorAll("*"))) {
      const cs = getComputedStyle(el);
      if (!/(auto|scroll)/.test(cs.overflowY)) continue;
      const room = el.scrollHeight - el.clientHeight;
      if (room > 40 && (!best || room > best.room)) best = { el, room };
    }
    const target = best?.el ?? stack;
    const r = target.getBoundingClientRect();
    return {
      x: r.left + r.width / 2,
      y: r.top + Math.min(r.height / 2, 300),
      room: best?.room ?? 0,
    };
  });
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x, box!.y);
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(400);
  return box!;
}

/** Empty rounded boxes at the corner other than the pill's own shade and shell. */
async function ghosts(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    // The selection thumb inside a segmented control is a painted, rounded,
    // empty box on purpose; it sits in the control, not floating over the page.
    const known = (el: Element) =>
      el.closest(".v3c-anchor") !== null ||
      el.closest("[data-v3-portals]") !== null ||
      el.matches("[data-seg-thumb]");
    for (const el of Array.from(
      document.querySelectorAll(".needt-v3 *")
    ) as HTMLElement[]) {
      if (known(el) || el.childElementCount > 0 || el.textContent?.trim())
        continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (Number(cs.opacity) === 0) continue;
      if (cs.position !== "absolute" && cs.position !== "fixed") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 100 || r.width > 240 || r.height < 30 || r.height > 70)
        continue;
      if (r.bottom <= 0 || r.top >= innerHeight) continue;
      const painted =
        (cs.backgroundColor !== "rgba(0, 0, 0, 0)" &&
          cs.backgroundColor !== "transparent") ||
        cs.boxShadow !== "none";
      const round = parseFloat(cs.borderTopLeftRadius) > 4;
      if (painted && round) {
        out.push(
          `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} ${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)}`
        );
      }
    }
    return out;
  });
}

async function pill(page: Page) {
  return page.evaluate(() => {
    const btn = document.querySelector<HTMLElement>("[data-chat-pill]");
    const shade = document.querySelector<HTMLElement>(".v3c-shade.is-on");
    const layer = btn?.closest<HTMLElement>(".v3c-layer");
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const s = shade?.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 8);
    return {
      rect: {
        left: Math.round(r.left),
        top: Math.round(r.top),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
      },
      shade: s
        ? {
            left: Math.round(s.left),
            top: Math.round(s.top),
            right: Math.round(s.right),
            bottom: Math.round(s.bottom),
          }
        : null,
      layerOpacity: layer ? Number(getComputedStyle(layer).opacity) : -1,
      onTop: !!hit && (btn === hit || btn.contains(hit)),
      text: btn.textContent ?? "",
      w: innerWidth,
      h: innerHeight,
    };
  });
}

for (const engine of ENGINES) {
  for (const scheme of ["light", "dark"] as const) {
    test(`Swift shell holds its frame, ${engine.name}, ${scheme}`, async ({
      baseURL,
    }, testInfo) => {
      void baseURL;
      let browser: Browser;
      try {
        browser = await launch(engine.type);
      } catch (error) {
        test.skip(true, `${engine.name} is not installed: ${String(error)}`);
        return;
      }
      mkdirSync(SHOTS, { recursive: true });
      const shot = async (page: Page, name: string) => {
        const path = join(SHOTS, `swift-${engine.name}-${scheme}-${name}.png`);
        await page.screenshot({ path });
        await testInfo.attach(`${engine.name}-${scheme}-${name}`, {
          path,
          contentType: "image/png",
        });
      };
      const { page, close } = await openToday(browser, scheme);
      try {
        const before = await frame(page);
        await shot(page, "1-before");

        // The frame at rest: bar on top, rail below it, scope is the window.
        expect(before.topBar.top).toBe(0);
        expect(before.topBar.height).toBeGreaterThanOrEqual(TOP_BAR);
        expect(before.rail?.top ?? 0).toBeGreaterThanOrEqual(TOP_BAR);
        expect(before.doc).toBe(0);
        expect(before.scope[5]).toBe(900);
        await expect(page.locator(".tab-bar").first()).toBeInViewport();

        // The person scrolls the main pane, then the page is pushed every
        // other way it can be pushed.
        await scrollMainPane(page);
        await pushFrame(page);
        await page.waitForTimeout(300);
        const after = await frame(page);
        await shot(page, "2-after-scroll");

        expect(after.doc).toBe(0);
        expect(after.scope.slice(0, 4)).toEqual([0, 0, 0, 0]);
        expect(after.topBar).toEqual(before.topBar);
        expect(after.rail).toEqual(before.rail);
        expect(after.rail?.top ?? 0).toBeGreaterThanOrEqual(TOP_BAR);
        await expect(page.locator(".tab-bar").first()).toBeInViewport({
          ratio: 1,
        });

        // No empty rounded box floats over the page.
        expect(await ghosts(page)).toEqual([]);

        // Ask Needt: in the window, on top, its words drawn, its shade is
        // its own box and nothing else.
        const p = await pill(page);
        expect(p).not.toBeNull();
        expect(p!.text).toContain("Ask Needt");
        expect(p!.layerOpacity).toBe(1);
        expect(p!.onTop).toBe(true);
        expect(p!.rect.right).toBeLessThanOrEqual(p!.w);
        expect(p!.rect.bottom).toBeLessThanOrEqual(p!.h);
        expect(p!.rect.top).toBeGreaterThan(0);
        if (p!.shade) {
          expect(Math.abs(p!.shade.right - p!.rect.right)).toBeLessThanOrEqual(
            1
          );
          expect(
            Math.abs(p!.shade.bottom - p!.rect.bottom)
          ).toBeLessThanOrEqual(1);
          expect(p!.shade.left).toBeGreaterThanOrEqual(p!.rect.left - 1);
          expect(p!.shade.top).toBeGreaterThanOrEqual(p!.rect.top - 1);
        }
        await expect(page.locator("[data-chat-pill]")).toBeInViewport({
          ratio: 1,
        });
        await shot(page, "3-final");
      } finally {
        await close();
        await browser.close();
      }
    });
  }
}

/* ── WebKit paint checks (Mac app, large windows) ───────────────────────────
 * The owner's WKWebView showed: a sky that stops at a hard vertical edge, the
 * Connections title on top of its subtitle, a tall ghost panel over Home where
 * the notification corner is, and an Ask pill that was an empty rectangle.
 * Each is a box measurement, so it can be held in CI without a person looking.
 * Measurements are printed as JSON so a failing run says what it saw. */
const SIZES = [
  { width: 1440, height: 900 },
  { width: 2000, height: 1300 },
  // The owner's Mac: a 2000x1300 window on a Retina screen.
  { width: 2000, height: 1300, dpr: 2 },
] as const;

async function skyReport(page: Page) {
  return page.evaluate(() => {
    const out: Array<Record<string, unknown>> = [];
    for (const root of Array.from(
      document.querySelectorAll<HTMLElement>(".px-sky")
    )) {
      const rr = root.getBoundingClientRect();
      if (rr.width < 40 || rr.height < 40) continue;
      const cv = root.querySelector<HTMLCanvasElement>(".px-canvas");
      const dv = root.querySelector<HTMLCanvasElement>(".px-dotscreen");
      if (!cv || !dv) continue;
      const cr = cv.getBoundingClientRect();
      const dr = dv.getBoundingClientRect();
      const strips = 10;
      const distinct: number[] = [];
      const dots: number[] = [];
      try {
        const cx = cv.getContext("2d");
        if (cx && cv.width > 1) {
          const d = cx.getImageData(0, 0, cv.width, cv.height).data;
          for (let k = 0; k < strips; k++) {
            const x0 = Math.floor((cv.width * k) / strips);
            const x1 = Math.floor((cv.width * (k + 1)) / strips);
            const seen = new Set<number>();
            for (let y = 0; y < cv.height; y++)
              for (let x = x0; x < x1; x++) {
                const o = (y * cv.width + x) * 4;
                seen.add((d[o] << 16) | (d[o + 1] << 8) | d[o + 2]);
              }
            distinct.push(seen.size);
          }
        }
        const dx = dv.getContext("2d");
        if (dx && dv.width > 1) {
          const d = dx.getImageData(0, 0, dv.width, dv.height).data;
          for (let k = 0; k < strips; k++) {
            const x0 = Math.floor((dv.width * k) / strips);
            const x1 = Math.floor((dv.width * (k + 1)) / strips);
            let n = 0;
            for (let y = 0; y < dv.height; y += 2)
              for (let x = x0; x < x1; x += 2)
                if (d[(y * dv.width + x) * 4 + 3] > 0) n++;
            dots.push(n);
          }
        }
      } catch {
        /* unreadable canvas: report what we have */
      }
      out.push({
        where: root.closest("[data-v3-screen]")?.getAttribute("data-v3-screen"),
        root: [rr.left, rr.top, rr.width, rr.height].map(Math.round),
        canvas: [cr.left, cr.top, cr.width, cr.height].map(Math.round),
        dot: [dr.left, dr.top, dr.width, dr.height].map(Math.round),
        backing: [cv.width, cv.height, dv.width, dv.height],
        dpr: devicePixelRatio,
        distinct,
        dots,
      });
    }
    return out;
  });
}

for (const engine of ENGINES) {
  for (const size of SIZES) {
    test(`Swift shell paints, ${engine.name}, ${size.width}x${size.height}@${"dpr" in size ? size.dpr : 1}`, async ({
      baseURL,
    }, testInfo) => {
      void baseURL;
      let browser: Browser;
      try {
        browser = await launch(engine.type);
      } catch (error) {
        test.skip(true, `${engine.name} is not installed: ${String(error)}`);
        return;
      }
      mkdirSync(SHOTS, { recursive: true });
      const dpr = "dpr" in size ? size.dpr : 1;
      const tag = `${engine.name}-${size.width}x${dpr}`;
      const shot = async (page: Page, name: string) => {
        const path = join(SHOTS, `paint-${tag}-${name}.png`);
        await page.screenshot({ path });
        await testInfo.attach(`${tag}-${name}`, {
          path,
          contentType: "image/png",
        });
      };
      const { page, close } = await openToday(browser, "light", size);
      try {
        // Home: the corner is the pill's box and nothing more.
        await page.waitForTimeout(1500);
        await shot(page, "1-home");
        const corner = await page.evaluate(() => {
          const shell = document.querySelector<HTMLElement>(".v3c-shell");
          const anchor = document.querySelector<HTMLElement>(".v3c-anchor");
          if (!shell || !anchor) return null;
          const r = shell.getBoundingClientRect();
          const cs = getComputedStyle(shell);
          const m = /inset\(([\d.]+)px [\d.]+px [\d.]+px ([\d.]+)px/.exec(
            cs.clipPath
          );
          const top = m ? Number(m[1]) : 0;
          const left = m ? Number(m[2]) : 0;
          // What is painted at the shell's unclipped top-left corner?
          const probe = document.elementFromPoint(r.left + 6, r.top + 6);
          return {
            clipPath: cs.clipPath,
            frame: [r.width, r.height].map(Math.round),
            visible: [r.width - left, r.height - top].map(Math.round),
            probeIsShell: !!probe && shell.contains(probe),
            anchor: anchor.getBoundingClientRect().toJSON(),
            vw: innerWidth,
            vh: innerHeight,
          };
        });
        console.log(`CORNER ${tag} ${JSON.stringify(corner)}`);
        expect.soft(corner).not.toBeNull();
        // Either the box is exactly what it shows, or a clip hides the rest.
        const clipped = corner!.clipPath !== "none";
        if (!clipped) {
          expect
            .soft(corner!.frame[0])
            .toBeLessThanOrEqual(corner!.visible[0] + 1);
          expect
            .soft(corner!.frame[1])
            .toBeLessThanOrEqual(corner!.visible[1] + 1);
        }
        // Resting corner: the pill (142x40), never wider than one toast (376).
        expect.soft(corner!.visible[0]).toBeLessThanOrEqual(376);
        expect.soft(corner!.visible[1]).toBeLessThanOrEqual(54 * 4 + 28);
        // The corner's own box is never bigger than one toast either.
        expect.soft(corner!.anchor.width).toBeLessThanOrEqual(376);
        expect.soft(corner!.anchor.height).toBeLessThanOrEqual(54 * 4 + 28);
        if (clipped) expect.soft(corner!.probeIsShell).toBe(false);

        // Ask Needt opens.
        const p = await pill(page);
        expect.soft(p?.onTop).toBe(true);
        expect.soft(p?.text ?? "").toContain("Ask Needt");
        await page.locator("[data-chat-pill]").click();
        await page.waitForTimeout(900);
        await shot(page, "2-ask-open");
        await expect
          .soft(page.locator("[data-chat-panel]").first())
          .toBeVisible();
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);

        // Connections: the sky fills its box; title and subtitle are apart.
        await page.goto("/connections").catch(() => undefined);
        await page.locator("[data-cn-screen]").waitFor({ timeout: 60_000 });
        await page.waitForTimeout(3500);
        await shot(page, "3-connections");
        const skies = await skyReport(page);
        console.log(`SKY ${tag} ${JSON.stringify(skies)}`);
        expect.soft(skies.length).toBeGreaterThan(0);
        for (const s of skies) {
          const root = s.root as number[];
          for (const key of ["canvas", "dot"] as const) {
            const b = s[key] as number[];
            expect.soft(Math.abs(b[0] - root[0])).toBeLessThanOrEqual(2);
            expect.soft(Math.abs(b[1] - root[1])).toBeLessThanOrEqual(2);
            expect.soft(Math.abs(b[2] - root[2])).toBeLessThanOrEqual(2);
            expect.soft(Math.abs(b[3] - root[3])).toBeLessThanOrEqual(2);
          }
          // The painted pixels reach the right edge, not only the left 40%.
          const distinct = s.distinct as number[];
          if (distinct.length) {
            const left = Math.max(...distinct.slice(0, 4));
            const right = Math.max(...distinct.slice(-3));
            expect.soft(right).toBeGreaterThan(left * 0.25);
          }
        }
        const h = await page.evaluate(() => {
          const t = document.querySelector<HTMLElement>(".cn-h1");
          const sub = document.querySelector<HTMLElement>(".cn-screen-text-5");
          if (!t || !sub) return null;
          const a = t.getBoundingClientRect();
          const b = sub.getBoundingClientRect();
          // The glyphs, not just the line box.
          const range = document.createRange();
          range.selectNodeContents(t);
          const g = range.getBoundingClientRect();
          return {
            title: [a.top, a.bottom].map(Math.round),
            glyphs: [g.top, g.bottom].map(Math.round),
            sub: [b.top, b.bottom].map(Math.round),
            fontFamily: getComputedStyle(t).fontFamily,
            lineHeight: getComputedStyle(t).lineHeight,
          };
        });
        console.log(`TITLE ${tag} ${JSON.stringify(h)}`);
        expect.soft(h).not.toBeNull();
        expect.soft(h!.title[1]).toBeLessThanOrEqual(h!.sub[0]);
        expect.soft(h!.glyphs[1]).toBeLessThanOrEqual(h!.sub[0] + 1);
      } finally {
        await close();
        await browser.close();
      }
    });
  }
}
