import type { Page } from "@playwright/test";

/**
 * Home v2 keeps all overdue work in ONE row ("N overdue -> Sort out"), closed
 * by default. A spec that touches an overdue row opens it first. It waits for
 * the screen, then needs the row: a missing row fails loudly here instead of
 * as a missing task further on.
 */
export async function openOverdue(page: Page, timeout = 20_000) {
  await page
    .locator("[data-hv2-now], [data-hv2-late]")
    .first()
    .waitFor({ state: "visible", timeout });
  const toggle = page.locator("[data-hv2-late-toggle]").first();
  try {
    await toggle.waitFor({ state: "visible", timeout });
  } catch {
    throw new Error(
      "openOverdue: Home is up but there is no overdue row ([data-hv2-late-toggle]); is home_v2 on and is a task overdue?"
    );
  }
  if ((await toggle.getAttribute("aria-expanded")) === "false") {
    await toggle.click();
  }
}
