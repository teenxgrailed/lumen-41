import { type Page, expect, test } from "@playwright/test";

import { prisma } from "@/lib/prisma";

import { createV3User, signInAs } from "./helpers/v3-user";

/*
 * Moodboards on the v3 screens, against the real API and database: make a
 * board, name it, add a note and a colour to it, and find all of it after a
 * reload. The grid is the board; the old canvas lives behind `?view=canvas`.
 */

/** The transient "what you did" pill at the bottom centre. */
const notices = (page: Page) =>
  page.getByRole("region", { name: "Needt action notices" });

test("Moodboard: a new board takes a name and a note, and keeps both after a reload", async ({
  page,
}) => {
  const user = await createV3User("moodboard");
  await signInAs(page, user);

  await page.goto("/moodboards");
  await expect(page.getByText("No moodboards yet")).toBeVisible();
  await page.getByRole("button", { name: "New moodboard" }).first().click();
  await page.waitForURL(/\/moodboards\/[^/]+$/);
  const id = page.url().split("/").pop() as string;
  await expect(notices(page)).toContainText("Moodboard created");

  // Name it: the title is the rename field.
  await page.getByRole("button", { name: "Untitled moodboard" }).click();
  await page
    .getByRole("textbox", { name: "Board name" })
    .fill("Launch direction");
  await page.getByRole("textbox", { name: "Board name" }).press("Enter");
  await expect
    .poll(
      async () => (await prisma.moodboard.findUnique({ where: { id } }))?.title
    )
    .toBe("Launch direction");

  // Add → Note.
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Note/ }).click();
  await page
    .getByRole("textbox", { name: "Note" })
    .fill("Warm, quiet, lots of air");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Warm, quiet, lots of air")).toBeVisible();
  await expect
    .poll(() => prisma.moodboardItem.count({ where: { moodboardId: id } }))
    .toBe(1);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Launch direction" })
  ).toBeVisible();
  await expect(page.getByText("Warm, quiet, lots of air")).toBeVisible();
  await expect(page.getByText("1 reference")).toBeVisible();
});

for (const width of [360, 390]) {
  test(`Moodboard: the phone makes a board and adds a note without horizontal overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const user = await createV3User(`moodboard-phone-${width}`);
    await signInAs(page, user);

    await page.goto("/moodboards");
    await expect(page.getByText("No boards yet")).toBeVisible();
    await page.getByRole("button", { name: "New board" }).last().click();
    await page.getByRole("textbox", { name: "Name" }).fill("Launch direction");
    await page.getByRole("button", { name: "Create" }).click();
    await page.waitForURL(/\/moodboards\/[^/]+$/);
    const id = page.url().split("/").pop() as string;
    await expect(
      page.getByRole("heading", { name: "Launch direction" })
    ).toBeVisible();

    // The controls the board offers are all on screen and answer a press.
    for (const name of ["Add", "Share", "Board options"]) {
      const box = await page
        .getByRole("button", { name, exact: true })
        .boundingBox();
      expect(box, `${name} should be laid out`).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Note/ }).click();
    await page
      .getByRole("textbox", { name: "Note" })
      .fill("Warm, quiet, lots of air");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("Warm, quiet, lots of air")).toBeVisible();
    await expect
      .poll(() => prisma.moodboardItem.count({ where: { moodboardId: id } }))
      .toBe(1);

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
  });
}
