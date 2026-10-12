import { expect, test } from "@playwright/test";

import { newDate } from "@/lib/date-utils";

import { VISUAL_TEST_NOW } from "./fixtures";
import { signInVisualUser } from "./helpers";

test("calendar shows and edits a local event through the production route", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.clock.setFixedTime(newDate(VISUAL_TEST_NOW));
  await signInVisualUser(page);

  const date = "2026-07-17";
  await page.request.delete(`/api/flexible-hours?date=${date}`);
  const feedResponse = await page.request.post("/api/feeds", {
    data: {
      name: "Calendar journey",
      type: "LOCAL",
      color: "#476F55",
      enabled: true,
    },
  });
  expect(feedResponse.ok()).toBeTruthy();
  const feed = (await feedResponse.json()) as { id: string };

  const title = `Calendar journey ${crypto.randomUUID().slice(0, 8)}`;
  const eventResponse = await page.request.post("/api/events", {
    data: {
      feedId: feed.id,
      title,
      start: `${date}T10:30:00.000Z`,
      end: `${date}T11:15:00.000Z`,
      allDay: false,
    },
  });
  expect(eventResponse.ok()).toBeTruthy();
  const event = (await eventResponse.json()) as { id: string };

  await page.goto("/calendar", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".needt-v2:not(.needt-notices)")).toBeVisible();
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  await page.getByText(title, { exact: true }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Edit event" })
  ).toBeVisible();
  await dialog.getByLabel("Title").fill(`${title} updated`);
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/events") &&
      response.request().method() === "PATCH"
  );
  await dialog.getByRole("button", { name: "Save event" }).click();
  expect((await saved).ok()).toBeTruthy();
  await expect(
    page.getByText(`${title} updated`, { exact: true }).first()
  ).toBeVisible();

  await page.request.delete("/api/events", { data: { id: event.id } });
  await page.request.delete("/api/feeds", { data: { id: feed.id } });
});
