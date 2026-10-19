import { expect, test } from "@playwright/test";

import { createV3User, signInAs } from "./helpers/v3-user";

/**
 * The phone screen reaches the very bottom row of the display on every
 * surface, in the order the owner saw the band appear: Home, Docs, Home,
 * reload. At each step the element under (195, 843) must be inside the screen
 * (not html / body), the scope must end at the viewport's bottom, and the
 * page colour and theme-color must be the same ones as at the start.
 */
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test("no band at the bottom: Home, Docs, Home, reload", async ({
  page,
  context,
}) => {
  const user = await createV3User("phone-band");
  await signInAs(page, user);
  await context.addCookies([
    { name: "needt-ui", value: "phone", url: "http://localhost:3000" },
  ]);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: 47, bottom: 34, left: 0, right: 0 },
  });

  const read = () =>
    page.evaluate(() => {
      const scope = document.querySelector(".needt-v3");
      const under = document.elementsFromPoint(195, 843);
      return {
        scopeBottom: scope?.getBoundingClientRect().bottom ?? null,
        inner: window.innerHeight,
        htmlBg: getComputedStyle(document.documentElement).backgroundColor,
        themeColors: Array.from(
          new Set(
            Array.from(
              document.querySelectorAll('meta[name="theme-color"]')
            ).map((m) => (m as HTMLMetaElement).content)
          )
        ),
        insideScope: !!scope && under.some((e) => scope.contains(e)),
        topmostIsPage:
          under[0] === document.body || under[0] === document.documentElement,
      };
    });

  const steps: Array<Awaited<ReturnType<typeof read>>> = [];
  for (const go of [
    () => page.goto("/"),
    () => page.goto("/pages"),
    () => page.goto("/"),
    () => page.reload(),
  ]) {
    await go();
    await page.locator('.needt-v3[data-ui="phone"]').waitFor();
    // The edge tint writes both colours after mount: wait for it to settle.
    await expect
      .poll(async () => {
        const s = await read();
        return s.htmlBg === s.themeColors[0];
      })
      .toBe(true);
    steps.push(await read());
  }

  for (const s of steps) {
    expect(s.scopeBottom).toBe(s.inner);
    expect(s.insideScope).toBe(true);
    expect(s.topmostIsPage).toBe(false);
    expect(s.themeColors).toHaveLength(1);
  }
  // the same colours every time, whichever screen it is
  expect(new Set(steps.map((s) => s.htmlBg)).size).toBe(1);
  expect(new Set(steps.map((s) => s.themeColors[0])).size).toBe(1);
});
