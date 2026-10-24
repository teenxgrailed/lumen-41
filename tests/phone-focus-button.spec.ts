import { expect, test } from "@playwright/test";

import { prisma } from "@/lib/prisma";

import { createV3User, signInAs } from "./helpers/v3-user";

/**
 * The phone's Focus button: a round glass button left of the dock pill, drawn
 * only while a session runs. At the narrow widths the row is the design's
 * (additions-2/focus-done: 64 px button, 10 px, 232 px pill, centred, no New
 * task), and the button opens the Focus sheet. `PHONE_SHOTS=<dir>` also writes screenshots (light and dark).
 */
for (const width of [375, 390]) {
  for (const scheme of ["light", "dark"] as const) {
    test(`focus button beside the dock at ${width}px, ${scheme}`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        hasTouch: true,
        isMobile: true,
        colorScheme: scheme,
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      const user = await createV3User("phone-focus");
      await prisma.userSettings.upsert({
        where: { userId: user.id },
        update: { theme: scheme },
        create: { userId: user.id, theme: scheme, timeZone: "Europe/Zurich" },
      });
      await signInAs(page, user);
      await context.addCookies([
        { name: "needt-ui", value: "phone", url: "http://127.0.0.1:3000" },
      ]);
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setSafeAreaInsetsOverride", {
        insets: { top: 47, bottom: 34, left: 0, right: 0 },
      });

      await page.goto("/");
      await page.locator('.needt-v3[data-ui="phone"]').waitFor();
      // Idle: no button.
      await expect(page.locator(".nva-focus-btn")).toHaveCount(0);

      const res = await page.request.post("/api/focus/session", {
        data: {
          action: "start",
          taskId: null,
          plannedMinutes: 25,
          intention: "Deep work",
          mode: "POMODORO",
          phase: "FOCUS",
          source: "web",
        },
      });
      expect(res.ok()).toBe(true);
      await page.reload();
      const btn = page.locator(".nva-focus-btn.is-in");
      await expect(btn).toBeVisible({ timeout: 30_000 });
      await expect(btn).toHaveAttribute("data-assistant-avoid", "");

      const box = async (sel: string) =>
        (await page.locator(sel).boundingBox())!;
      // additions-2/focus-done .fd-dockrow: a 64 px button 10 px left of a
      // 232 px pill, the pair centred, and no New task button.
      const f = await box(".nva-focus-btn");
      const p = await box("[data-nva-pill]");
      expect(f.width).toBeCloseTo(64, 0);
      expect(f.height).toBeCloseTo(64, 0);
      expect(p.width).toBeCloseTo(232, 0);
      expect(f.y + f.height / 2).toBeCloseTo(p.y + p.height / 2, 0);
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(p.x - (f.x + f.width)).toBeCloseTo(10, 0);
      expect(p.x + p.width).toBeLessThanOrEqual(width);
      expect(f.x).toBeCloseTo(width - (p.x + p.width), 0);
      await expect(page.locator(".nva-add")).toBeHidden();

      const dir = process.env.PHONE_SHOTS;
      if (dir) {
        await page.screenshot({ path: `${dir}/focus-${width}-${scheme}.png` });
      }

      await btn.tap();
      await expect(
        page.locator(".pov-focus.is-open, .pov-focus")
      ).toBeVisible();
      await context.close();
    });
  }
}
