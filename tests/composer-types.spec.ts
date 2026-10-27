import { type Page, expect, test } from "@playwright/test";

import { prisma } from "@/lib/prisma";

import { createV3User, signInAs } from "./helpers/v3-user";

/*
 * The create composer is three forms. Task, Event and Doc each have their own
 * placeholder, fields and button, and each commits through its own API:
 * a doc opens once it exists, an event lands in a Needt calendar with its
 * place. Each test owns its account.
 */

async function openComposer(page: Page) {
  await page.goto("/tasks");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: /New Task/ }).click();
}

test("Composer: Doc is its own form and a created doc opens", async ({
  page,
}) => {
  const user = await createV3User("composer-doc");
  await signInAs(page, user);
  const title = "Quarterly plan tomorrow 3pm";

  await openComposer(page);
  await page.getByRole("tab", { name: "Doc" }).click();
  await expect(page.getByPlaceholder("Untitled doc")).toBeVisible();
  await expect(page.getByRole("button", { name: /Priority/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Duration/ })).toHaveCount(0);

  await page.getByLabel("Doc title").fill(title);
  await page.getByRole("button", { name: /Create doc/ }).click();

  await expect(page).toHaveURL(/\/pages\//);
  await expect
    .poll(() => prisma.page.count({ where: { userId: user.id, title } }))
    .toBe(1);
});

test("Composer: an event keeps its place and lands in a calendar", async ({
  page,
}) => {
  const user = await createV3User("composer-event");
  await signInAs(page, user);

  await openComposer(page);
  await page.keyboard.press("Control+2");
  await expect(page.getByRole("tab", { name: "Event" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(page.getByPlaceholder("New event")).toBeVisible();
  await expect(page.getByRole("button", { name: /Priority/ })).toHaveCount(0);

  await page.getByLabel("Event name").fill("Design review tomorrow 3pm");
  await page.getByLabel("Location").fill("Room 4");
  await page.getByRole("button", { name: /Add event/ }).click();

  await expect
    .poll(() =>
      prisma.calendarEvent.count({
        where: {
          title: "Design review",
          location: "Room 4",
          feed: { userId: user.id },
        },
      })
    )
    .toBe(1);
});
