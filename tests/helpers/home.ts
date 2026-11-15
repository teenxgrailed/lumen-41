import type { Page } from "@playwright/test";

/**
 * Home v2 keeps all overdue work in ONE row ("N overdue -> Sort out"), closed
 * by default. A spec that touches an overdue row opens it first. Safe when
 * there is no such row (flag off, nothing overdue): then it does nothing.
 */
export async function openOverdue(page: Page, timeout = 5000) {
  const toggle = page.locator("[data-hv2-late-toggle]");
  try {
    await toggle.first().waitFor({ state: "visible", timeout });
  } catch {
    return;
  }
  if ((await toggle.first().getAttribute("aria-expanded")) === "false") {
    await toggle.first().click();
  }
}
