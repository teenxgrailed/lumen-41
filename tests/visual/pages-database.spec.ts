import { expect, test } from "@playwright/test";

import { signInVisualUser } from "./helpers";

/* This drives the database's view switcher and grouping controls, which the desktop and tablet
 * faces draw. The phone (< 700 px) reads a page in its own face (phone/docs):
 * the editor sits under its floating bar and the database has no view
 * switcher, so these steps do not exist there. The phone face has its own
 * tests (src/components/needt3/phone/docs/__tests__). */
test.skip(
  ({ viewport }) => (viewport?.width ?? 0) < 700,
  "The phone has its own document face."
);

test("Page database views share editable records, filters, sorting and grouping", async ({
  page,
}) => {
  await signInVisualUser(page);
  const created = await page.request.post("/api/databases", {
    data: { title: "Database regression", isPrivate: true },
  });
  expect(created.ok()).toBeTruthy();
  const createdBody = (await created.json()) as {
    page: {
      id: string;
      database: {
        id: string;
        properties: Array<{ id: string; name: string; type: string }>;
      };
    };
  };
  const pageId = createdBody.page.id;
  const databaseId = createdBody.page.database.id;

  const statusProperty =
    createdBody.page.database.properties.find(
      (property) => property.name === "Status"
    ) ??
    (
      await (
        await page.request.post(`/api/databases/${databaseId}/properties`, {
          data: { name: "Status", type: "SELECT" },
        })
      ).json()
    ).property;
  const dateProperty =
    createdBody.page.database.properties.find(
      (property) => property.name === "Date"
    ) ??
    (
      await (
        await page.request.post(`/api/databases/${databaseId}/properties`, {
          data: { name: "Date", type: "DATE" },
        })
      ).json()
    ).property;

  const first = await page.request.post(
    `/api/databases/${databaseId}/records`,
    {
      data: {
        title: "Alpha launch",
        values: {
          [statusProperty.id]: "Doing",
          [dateProperty.id]: "2026-07-23",
        },
      },
    }
  );
  const second = await page.request.post(
    `/api/databases/${databaseId}/records`,
    {
      data: {
        title: "Beta review",
        values: {
          [statusProperty.id]: "Done",
          [dateProperty.id]: "2026-07-24",
        },
      },
    }
  );
  expect(first.ok()).toBeTruthy();
  expect(second.ok()).toBeTruthy();

  const query = await page.request.post(`/api/databases/${databaseId}/query`, {
    data: {
      filters: [
        {
          propertyId: statusProperty.id,
          operator: "equals",
          value: "Doing",
        },
      ],
      sort: [{ field: "title", direction: "desc" }],
    },
  });
  const queryBody = (await query.json()) as {
    records: Array<{ page: { title: string } }>;
  };
  expect(queryBody.records.map((record) => record.page.title)).toEqual([
    "Alpha launch",
  ]);

  await page.goto(`/pages/${pageId}`, { waitUntil: "domcontentloaded" });
  const workspace = page.getByTestId("database-view");
  const viewSwitcher = workspace.locator("..");
  await expect(page.getByRole("button", { name: "Table" })).toBeVisible();
  const recordNames = page.getByLabel("Record name");
  await expect(recordNames).toHaveCount(2);
  expect(
    await recordNames.evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value)
    )
  ).toEqual(["Alpha launch", "Beta review"]);

  await page.getByRole("button", { name: "Board" }).click();
  await expect(page.getByLabel("Record name").first()).toHaveValue(
    "Alpha launch"
  );
  // The shell's tab rail has a Calendar tab of its own on desktop, so the
  // database's own view switcher has to be named rather than guessed at.
  await viewSwitcher.getByRole("button", { name: "Calendar" }).click();
  await expect(workspace.getByText("2026-07-23")).toBeVisible();
  await page.getByRole("button", { name: "Timeline" }).click();
  await expect(workspace.getByText("Alpha launch")).toBeVisible();
  await page.getByRole("button", { name: "Gallery" }).click();
  await expect(workspace.getByText("Beta review")).toBeVisible();

  await page.getByLabel("Filter database records").fill("Alpha");
  await expect(workspace.getByText("Alpha launch")).toBeVisible();
  await expect(workspace.getByText("Beta review")).toHaveCount(0);

  await page.getByRole("button", { name: "Table" }).click();
  await page.getByLabel("Filter database records").fill("");
  // "New" is also the shell's composer button, so name the database's own.
  await viewSwitcher.getByRole("button", { name: "New", exact: true }).click();
  await expect(recordNames.last()).toHaveValue("Untitled");
  await page.getByLabel("Record name").last().fill("Gamma");
  await page.getByLabel("Record name").last().blur();
  await expect(recordNames.last()).toHaveValue("Gamma");

  const gammaDelete = page.getByRole("button", { name: "Delete Gamma" });
  await gammaDelete.click();
  await expect(recordNames).toHaveCount(2);

  await page.request.delete(`/api/pages/${pageId}`);
});
