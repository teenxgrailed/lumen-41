import { type Page, expect, test } from "@playwright/test";

import { signInVisualUser } from "./helpers";

/*
 * The design system's showcase, /admin/ds (2026-11-23): every shared
 * component, variant, size and state, light and dark. One baseline per
 * section per theme at 1440 and at 390, so a change to src/styles/ds/ shows
 * up as a diff on the component it touched and nothing else. The theme is
 * drawn by the page itself (`?scope=light|dark`), so the admin shell around
 * it never reaches a baseline.
 */
test.use({ serviceWorkers: "block" });
test.beforeEach(({}, info) => {
  test.skip(info.project.name === "tablet", "phone and desktop only");
});

const SECTIONS = [
  "tokens",
  "button",
  "icon-button",
  "chip",
  "switch",
  "segmented",
  "dock",
  "surface",
  "row",
  "sheet",
  "field",
] as const;

/**
 * The phone's floating bar and the assistant pill are fixed to the window, so
 * they would sit on top of whichever section is scrolled under them. Hide
 * everything fixed that is not the showcase itself (or holds it).
 */
async function hideFixedChrome(page: Page) {
  await page.evaluate(() => {
    const lab = document.querySelector("[data-ds-showcase]");
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      if (lab && (lab.contains(el) || el.contains(lab))) continue;
      if (getComputedStyle(el).position === "fixed")
        el.style.visibility = "hidden";
    }
  });
}

async function open(
  page: Page,
  phone: boolean,
  theme: "light" | "dark",
  query = ""
) {
  await page.setViewportSize(
    phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 }
  );
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
  });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await signInVisualUser(page);
  const res = await page.request.patch("/api/user-settings", {
    data: { theme },
  });
  expect(res.ok()).toBeTruthy();
  await page.goto(`/admin/ds?scope=${theme}${query}`);
  await page.addStyleTag({
    content:
      'nextjs-portal, .tsqd-parent-container, aside[aria-label="Quick Tip"] { display: none !important; }',
  });
  const scope = page.getByTestId(`ds-scope-${theme}`);
  await expect(scope).toBeVisible({ timeout: 60_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  return scope;
}

for (const theme of ["light", "dark"] as const) {
  test(`Design system showcase, ${theme}`, async ({ page }, info) => {
    test.setTimeout(240_000);
    const phone = info.project.name === "mobile";
    const tag = phone ? "390" : "1440";
    const scope = await open(page, phone, theme);
    for (const id of SECTIONS) {
      const section = scope.locator(`section#${id}`);
      await section.scrollIntoViewIfNeeded();
      await hideFixedChrome(page);
      await expect(section).toHaveScreenshot(`ds-${tag}-${theme}-${id}.png`, {
        animations: "disabled",
      });
    }
  });
}

test("Design system showcase fits the screen and shows both themes", async ({
  page,
}, info) => {
  const phone = info.project.name === "mobile";
  await open(page, phone, "light");
  // no sideways scroll at 390 or at 1440
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // without ?scope the page draws light and dark next to each other
  await page.goto("/admin/ds");
  await expect(page.getByTestId("ds-scope-light")).toBeVisible();
  await expect(page.getByTestId("ds-scope-dark")).toBeVisible();
});

test("Every control has a 44px hit area", async ({ page }, info) => {
  const phone = info.project.name === "mobile";
  await open(page, phone, "light", "&hit=1");
  // the ::after box of a control is at least 44 x 44, whatever the control measures
  const small = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(
      '[data-testid="ds-scope-light"] .ds-i'
    )) {
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const after = getComputedStyle(el, "::after");
      const w = parseFloat(after.width);
      const h = parseFloat(after.height);
      if (!(w >= 43.5 && h >= 43.5))
        out.push(
          `${el.className} ${Math.round(box.width)}x${Math.round(box.height)} -> ${w}x${h}`
        );
    }
    return out;
  });
  expect(small).toEqual([]);
});
