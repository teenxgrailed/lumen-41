import { expect, test } from "@playwright/test";
import sharp from "sharp";

import { prisma } from "@/lib/prisma";

import { createV3User, signInAs } from "./helpers/v3-user";

/**
 * The strip under the dock: with a 34 px home-indicator inset emulated, the
 * bottom rows of the display, left of the dock, wear the ground with no seam
 * (no row differs from the next), in both themes. `PHONE_SHOTS=<dir>` also
 * writes the screenshots.
 */
for (const scheme of ["light", "dark"] as const) {
  test(`no strip under the dock, ${scheme}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      colorScheme: scheme,
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    const user = await createV3User("phone-strip");
    await prisma.userSettings.upsert({
      where: { userId: user.id },
      update: { theme: scheme },
      create: { userId: user.id, theme: scheme, timeZone: "Europe/Zurich" },
    });
    await signInAs(page, user);
    await context.addCookies([
      { name: "needt-ui", value: "phone", url: "http://127.0.0.1:3000" },
      {
        name: "needt-look",
        value: `${scheme}.${scheme}.lavender`,
        url: "http://127.0.0.1:3000",
      },
    ]);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { top: 47, bottom: 34, left: 0, right: 0 },
    });
    await page.goto("/");
    await page.locator('.needt-v3[data-ui="phone"]').waitFor();
    await page.waitForTimeout(1500);
    const shot = await page.screenshot();
    const dir = process.env.PHONE_SHOTS;
    if (dir) await page.screenshot({ path: `${dir}/strip-${scheme}.png` });
    const { data, info } = await sharp(shot)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    };
    // Column x=4 (left of the dock), the last 60 rows: no step between rows.
    // The fog's halftone dots are anchored to the bottom edge (pushed down by
    // the home-indicator inset), so they no longer end ~42 px above it and
    // leave a plain band that reads as a line.
    const scale = info.height / 844;
    const x = Math.round(4 * scale);
    let worst = 0;
    for (let y = info.height - 60 * scale; y < info.height - 1; y++) {
      const a = px(x, Math.round(y));
      const b = px(x, Math.round(y) + 1);
      for (let k = 0; k < 3; k++)
        worst = Math.max(worst, Math.abs(a[k] - b[k]));
    }
    expect(worst).toBeLessThanOrEqual(2);
    await context.close();
  });
}
