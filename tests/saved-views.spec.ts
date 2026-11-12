import { type Page, expect, test } from "@playwright/test";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { createV3User, signInAs } from "./helpers/v3-user";

/*
 * Saved views on Tasks: save the current list under a name, come back to it
 * from the Views menu, rename it, delete it and undo the delete. Each step is
 * checked over `/api/saved-views` too, the way a connector reads the views.
 * The second test checks sharing with a workspace over the API alone.
 */

const SHOTS = "screens/saved-views";

type ApiView = {
  id: string;
  name: string;
  visibility: string;
  groupBy: string | null;
  filters: { field: string; operator: string; value: unknown }[];
};

const listViews = async (page: Page, workspaceId?: string) => {
  const res = await page.request.get("/api/saved-views?resource=TASKS", {
    headers: workspaceId ? { "x-workspace-id": workspaceId } : undefined,
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { views: ApiView[] }).views;
};

test("a list is saved as a view, picked again, renamed and deleted", async ({
  page,
}) => {
  const user = await createV3User("saved-views");
  const project = await prisma.project.create({
    data: {
      name: "Launch",
      color: "#3b82f6",
      userId: user.id,
      workspaceId: user.workspaceId,
    },
  });
  await prisma.task.createMany({
    data: [
      {
        title: "Write the launch post",
        status: "todo",
        userId: user.id,
        assigneeId: user.id,
        workspaceId: user.workspaceId,
        projectId: project.id,
      },
      {
        title: "Buy groceries",
        status: "todo",
        userId: user.id,
        assigneeId: user.id,
        workspaceId: user.workspaceId,
      },
    ],
  });
  await signInAs(page, user);

  // first hit on `next dev` compiles the route
  test.setTimeout(300_000);
  await page.goto("/tasks", { timeout: 240_000 });
  const tabs = page.getByRole("tablist", { name: "Tasks view" });
  await tabs.getByRole("tab", { name: /All Tasks/ }).click();
  await page.locator(`[data-wk-card="${project.id}"]`).click();
  await expect(page.getByText("Buy groceries")).toHaveCount(0);

  const trigger = page.locator("[data-saved-views-trigger]");
  await expect(trigger).toHaveText("Views");
  await trigger.click();
  // the list has loaded (first hit on `next dev` compiles the route)
  await expect(page.locator("[data-saved-views]")).toContainText(
    "Save this list",
    { timeout: 90_000 }
  );
  const panel = page.locator("[data-saved-views]");
  await panel.getByLabel("New view name").fill("Launch work");
  await page.screenshot({ path: `${SHOTS}/01-save.png` });
  await panel.getByRole("button", { name: "Save", exact: true }).click();

  await expect
    .poll(async () => (await listViews(page)).length, { timeout: 90_000 })
    .toBe(1);
  const [saved] = await listViews(page);
  expect(saved.name).toBe("Launch work");
  expect(saved.visibility).toBe("PERSONAL");
  expect(saved.groupBy).toBe("date");
  expect(saved.filters).toEqual(
    expect.arrayContaining([
      { field: "list", operator: "is", value: "all" },
      { field: "projectId", operator: "eq", value: project.id },
    ])
  );
  await expect(trigger).toHaveText("Launch work");

  // Move away: another tab, no project. The trigger no longer names a view.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Clear filter" }).click();
  await tabs.getByRole("tab", { name: /Inbox/ }).click();
  await expect(trigger).toHaveText("Views");

  // Pick the view: the list comes back.
  await trigger.click();
  await page.screenshot({ path: `${SHOTS}/02-list.png` });
  await panel.getByRole("button", { name: "Launch work", exact: true }).click();
  await expect(trigger).toHaveText("Launch work");
  await expect(page.getByText("Write the launch post").first()).toBeVisible();
  await expect(page.getByText("Buy groceries")).toHaveCount(0);

  // Rename.
  await trigger.click();
  await panel.getByRole("button", { name: "Rename Launch work" }).click();
  const input = panel.getByLabel("View name", { exact: true });
  await input.fill("Launch only");
  await input.press("Enter");
  await expect
    .poll(async () => (await listViews(page))[0]?.name)
    .toBe("Launch only");

  // Delete, then undo from the notice.
  await panel.getByRole("button", { name: "Delete Launch only" }).click();
  await expect.poll(async () => (await listViews(page)).length).toBe(0);
  await page
    .getByText("Deleted “Launch only”")
    .locator("xpath=ancestor::*[.//button[normalize-space()='Undo']][1]")
    .getByRole("button", { name: "Undo" })
    .click();
  await expect
    .poll(async () => (await listViews(page)).map((v) => v.name))
    .toEqual(["Launch only"]);
  await page.screenshot({ path: `${SHOTS}/03-after-undo.png` });
});

test("a workspace view is seen by members and changed only by editors", async ({
  page,
}) => {
  const owner = await createV3User("sv-owner");
  const viewer = await createV3User("sv-viewer");
  await prisma.featureFlagOverride.createMany({
    data: [owner.id, viewer.id].map((userId) => ({
      flagKey: "workspaces",
      userId,
      enabled: true,
    })),
  });
  const ws = await prisma.workspace.create({
    data: {
      name: "Saved views team",
      kind: WorkspaceKind.SHARED,
      members: {
        create: [
          { userId: owner.id, role: WorkspaceRole.OWNER },
          { userId: viewer.id, role: WorkspaceRole.VIEWER },
        ],
      },
    },
  });
  const h = { "x-workspace-id": ws.id };
  const body = (name: string, visibility: string) => ({
    name,
    visibility,
    resource: "TASKS",
    type: "list",
    groupBy: "project",
    filters: [{ field: "list", operator: "is", value: "all" }],
    sort: [{ field: "priority", direction: "asc" }],
  });

  await signInAs(page, owner);
  const created = await page.request.post("/api/saved-views", {
    headers: h,
    data: body("Team board", "WORKSPACE"),
  });
  expect(created.status()).toBe(201);
  const shared = ((await created.json()) as { view: ApiView }).view;

  await page.context().clearCookies();
  await signInAs(page, viewer);
  expect((await listViews(page, ws.id)).map((v) => v.name)).toEqual([
    "Team board",
  ]);
  const rename = await page.request.patch(`/api/saved-views/${shared.id}`, {
    headers: h,
    data: { name: "Mine now" },
  });
  expect(rename.status()).toBe(403);
  const share = await page.request.post("/api/saved-views", {
    headers: h,
    data: body("Viewer share", "WORKSPACE"),
  });
  expect(share.status()).toBe(403);
  const own = await page.request.post("/api/saved-views", {
    headers: h,
    data: body("Viewer private", "PERSONAL"),
  });
  expect(own.status()).toBe(201);

  // The viewer's personal view stays theirs.
  await page.context().clearCookies();
  await signInAs(page, owner);
  expect((await listViews(page, ws.id)).map((v) => v.name)).toEqual([
    "Team board",
  ]);
});
