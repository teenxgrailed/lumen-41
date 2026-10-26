import { type Page, expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { createV3User, signInAs } from "./helpers/v3-user";

/*
 * The phone's page change (owner decision 2026-10-26). A dock tile to the
 * right of the one you were on slides its page in from the right over the old
 * page, which gives way and dims; to the left, mirrored; a place from the menu
 * card rises from the dock; with Reduce Motion it is a 150 ms crossfade.
 *
 * The motion is paused as soon as it starts and read at 0, 50 and 100 %
 * (Web Animations: `currentTime`), so the frames do not depend on timing. The
 * dock pill and the fog must not move at any of them. The stills are written
 * to test-results/page-motion-frames (uploaded with the e2e report).
 */

const FRAMES = path.join("test-results", "page-motion-frames");
const WIDTH = 390;
const STEPS = [0, 0.5, 1] as const;

type Frame = {
  t: number;
  page: { left: number; opacity: number; scale: number };
  ghost: { left: number; opacity: number } | null;
  fog: { top: number; left: number } | null;
  pill: { top: number; left: number; width: number };
  names: string[];
  target: string;
};

async function open(page: Page, reducedMotion = false) {
  const user = await createV3User("page-motion");
  await signInAs(page, user);
  await page.context().addCookies([
    {
      name: "needt-ui",
      value: "phone",
      url: process.env.TEST_BASE_URL ?? "http://localhost:3000",
    },
  ]);
  if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/today");
  await page.locator('.needt-v3[data-ui="phone"]').waitFor();
  await expect(page.locator('[data-nva-icon="docs"]')).toBeVisible({
    timeout: 30_000,
  });
  // the dock is laid out once it is ready; a click before that lands nowhere
  await page.locator("[data-nva-ready]").first().waitFor({ state: "attached" });
}

/** Pauses every page-change animation the moment it starts. */
async function hold(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __pg: Set<Animation>;
      __pgStop: boolean;
    };
    w.__pg = new Set();
    w.__pgStop = false;
    const tick = () => {
      for (const a of document.getAnimations()) {
        const name = (a as CSSAnimation).animationName ?? "";
        if (!name.startsWith("v3-pg-")) continue;
        if (a.playState === "running") a.pause();
        w.__pg.add(a);
      }
      if (!w.__pgStop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Waits until the page's own animation (and the old page's, when there is one) is held. */
async function held(page: Page, count: number) {
  try {
    await page.waitForFunction(
      (n) =>
        (window as unknown as { __pg: Set<Animation> }).__pg.size >= n &&
        [...(window as unknown as { __pg: Set<Animation> }).__pg].every(
          (a) => a.playState === "paused"
        ),
      count,
      { timeout: 10_000 }
    );
  } catch (error) {
    const state = await page.evaluate(() => {
      const stage = document.querySelector("[data-v2p-host] > .v2p-stage");
      return {
        path: location.pathname,
        stage: stage?.getAttribute("data-pg") ?? null,
        ghost: !!document.querySelector(".pk-pg-ghost"),
        first: stage?.firstElementChild?.className ?? null,
        seen: [...(window as unknown as { __pg: Set<Animation> }).__pg].map(
          (a) => `${(a as CSSAnimation).animationName}:${a.playState}`
        ),
      };
    });
    throw new Error(`page change not held: ${JSON.stringify(state)}`, {
      cause: error,
    });
  }
}

/** The menu's own spring (the card closing after a pick) is not the page's motion: let it rest. */
async function settled(page: Page) {
  let last = "";
  for (let i = 0; i < 20; i++) {
    const now = await page.evaluate(() => {
      const r = document
        .querySelector("[data-nva-pill]")!
        .getBoundingClientRect();
      return `${r.top}|${r.left}|${r.width}`;
    });
    if (now === last) return;
    last = now;
    await page.waitForTimeout(120);
  }
}

/**
 * Seeks every held animation to each step in turn, reads the screen and takes
 * a still. The last step is the end: finishing the page's animation lets the
 * script release the old page, so it comes last.
 */
async function readFrames(page: Page, name: string): Promise<Frame[]> {
  await mkdir(FRAMES, { recursive: true });
  await settled(page);
  const out: Frame[] = [];
  for (const t of STEPS) {
    out.push(
      await page.evaluate((step) => {
        const w = window as unknown as { __pg: Set<Animation> };
        const box = (el: Element | null) => el?.getBoundingClientRect() ?? null;
        for (const a of w.__pg) {
          const d = Number(a.effect?.getComputedTiming().duration ?? 0);
          a.currentTime = step * d;
        }
        // the element the page change moves: the target of its own animation
        const own = [...w.__pg].find((a) =>
          (a as CSSAnimation).animationName.startsWith("v3-pg-in")
        );
        const pageEl =
          (own?.effect as KeyframeEffect | undefined)?.target ?? null;
        const sheet = document.querySelector(".pk-pg-ghost > .pk-pg-sheet");
        const fog = box(document.querySelector(".pk-fog"));
        const pill = box(document.querySelector("[data-nva-pill]"))!;
        const cs = pageEl ? getComputedStyle(pageEl) : null;
        return {
          t: step,
          page: {
            left: box(pageEl)?.left ?? NaN,
            opacity: cs ? Number(cs.opacity) : NaN,
            scale: cs ? new DOMMatrix(cs.transform).a : NaN,
          },
          ghost: sheet
            ? {
                left: box(sheet)!.left,
                opacity: Number(getComputedStyle(sheet).opacity),
              }
            : null,
          fog: fog ? { top: fog.top, left: fog.left } : null,
          pill: { top: pill.top, left: pill.left, width: pill.width },
          names: [...w.__pg].map((a) => (a as CSSAnimation).animationName),
          target: pageEl ? `${pageEl.tagName}.${pageEl.className}` : "none",
        };
      }, t)
    );
    await page
      .screenshot({
        path: path.join(FRAMES, `${name}-${Math.round(t * 100)}.png`),
        timeout: 8000,
      })
      .catch(() => undefined);
  }
  return out;
}

/** Nothing the dock or the fog does may change while the page moves. */
function expectStill(frames: Frame[]) {
  for (const f of frames) {
    expect(f.pill.top).toBeCloseTo(frames[0].pill.top, 0);
    expect(f.pill.left).toBeCloseTo(frames[0].pill.left, 0);
    expect(f.pill.width).toBeCloseTo(frames[0].pill.width, 0);
    if (frames[0].fog && f.fog) {
      expect(f.fog.top).toBeCloseTo(frames[0].fog.top, 0);
      expect(f.fog.left).toBeCloseTo(frames[0].fog.left, 0);
    }
  }
}

test.use({
  viewport: { width: WIDTH, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test("a tile on the right slides in from the right, a tile on the left from the left", async ({
  page,
}) => {
  await open(page);

  // Home -> Docs: Docs sits right of Home in the dock
  await hold(page);
  await page.locator('[data-nva-icon="docs"]').dispatchEvent("click");
  await held(page, 2);
  const fwd = await readFrames(page, "forward");
  expect(fwd[0].names.some((n) => n === "v3-pg-in-fwd")).toBe(true);
  expect(fwd[0].names.some((n) => n === "v3-pg-sheet-fwd-out")).toBe(true);
  // the page starts off the right edge, crosses and rests at 0
  expect(fwd[0].page.left, JSON.stringify(fwd[0])).toBeGreaterThan(
    WIDTH * 0.95
  );
  expect(fwd[1].page.left).toBeGreaterThan(WIDTH * 0.05);
  expect(fwd[1].page.left).toBeLessThan(WIDTH * 0.95);
  expect(Math.abs(fwd[2].page.left)).toBeLessThan(1);
  // the old page gives way to the left and dims, as the new one arrives
  expect(Math.abs(fwd[0].ghost!.left)).toBeLessThan(1);
  expect(fwd[1].ghost!.left).toBeLessThan(-1);
  expect(fwd[2].ghost!.left).toBeLessThan(fwd[1].ghost!.left);
  expect(fwd[2].ghost!.left).toBeGreaterThan(-WIDTH * 0.4);
  expect(fwd[0].ghost!.opacity).toBeGreaterThan(0.99);
  expect(fwd[2].ghost!.opacity).toBeLessThan(0.7);
  expectStill(fwd);

  // Docs -> Home: the other way
  await page.goto("/pages");
  await expect(page.locator('[data-nva-icon="home"]')).toBeVisible({
    timeout: 30_000,
  });
  await hold(page);
  await page.locator('[data-nva-icon="home"]').dispatchEvent("click");
  await held(page, 2);
  const back = await readFrames(page, "back");
  expect(back[0].names.some((n) => n === "v3-pg-in-back")).toBe(true);
  expect(back[0].page.left, JSON.stringify(back[0])).toBeLessThan(
    -WIDTH * 0.95
  );
  expect(back[1].page.left).toBeLessThan(-WIDTH * 0.05);
  expect(Math.abs(back[2].page.left)).toBeLessThan(1);
  expect(back[2].ghost!.left).toBeGreaterThan(1);
  expectStill(back);
});

test("a place from the menu rises from the dock, scale 0.96 to 1 and a fade", async ({
  page,
}) => {
  await open(page);
  await hold(page);
  await page.locator("[data-nva-open]").click();
  await page.locator('[data-nva-row="calendar"]').click();
  await held(page, 1);
  const rise = await readFrames(page, "rise");
  expect(rise[0].names).toContain("v3-pg-in-rise");
  expect(rise[0].page.opacity).toBeLessThan(0.05);
  expect(rise[0].page.scale).toBeCloseTo(0.96, 2);
  expect(rise[1].page.opacity).toBeGreaterThan(0.1);
  expect(rise[1].page.opacity).toBeLessThan(1);
  expect(rise[2].page.opacity).toBeCloseTo(1, 2);
  expect(rise[2].page.scale).toBeCloseTo(1, 2);
  // the old page stays where it is and is covered by the new one fading in
  expect(Math.abs(rise[1].ghost!.left)).toBeLessThan(1);
  expectStill(rise);
});

test("with Reduce Motion the page change is a 150 ms crossfade and nothing moves", async ({
  page,
}) => {
  await open(page, true);
  await hold(page);
  await page.locator('[data-nva-icon="docs"]').dispatchEvent("click");
  await held(page, 1);
  const fade = await readFrames(page, "fade");
  expect(fade[0].names).toEqual(["v3-pg-in-fade"]);
  const duration = await page.evaluate(
    () =>
      [
        ...(window as unknown as { __pg: Set<Animation> }).__pg,
      ][0].effect?.getComputedTiming().duration
  );
  expect(duration).toBe(150);
  for (const f of fade) {
    expect(Math.abs(f.page.left)).toBeLessThan(1);
    expect(f.ghost === null || Math.abs(f.ghost.left) < 1).toBe(true);
  }
  expect(fade[0].page.opacity).toBeLessThan(0.05);
  expect(fade[2].page.opacity).toBeCloseTo(1, 2);
  expectStill(fade);
});
