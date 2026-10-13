import { encode } from "next-auth/jwt";

import { type Page, expect, test } from "@playwright/test";
import { existsSync } from "node:fs";

if (!process.env.NEXTAUTH_SECRET && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const workspace = {
  id: "workspace-e2e",
  name: "Launch workspace",
  kind: "PERSONAL",
  createdAt: "2026-09-01T00:00:00.000Z",
};

const project = {
  id: "project-e2e",
  name: "Website launch",
  hue: "#d97706",
  glyph: "circle",
};

const person = {
  id: "workspace-e2e-user",
  name: "Project owner",
  initials: "PO",
  hue: "#2563eb",
};

function task(done = false, id = "task-e2e", title = "Publish website") {
  return {
    id,
    title,
    project: project.name,
    status: done ? undefined : "todo",
    done,
    due: "24 Sep",
    dueOn: "2026-09-24",
    est: 60,
    holder: person.id,
    stage: done ? "done" : "doing",
    parts: [],
  };
}

async function authenticate(page: Page) {
  const secret = process.env.NEXTAUTH_SECRET;
  expect(secret, "NEXTAUTH_SECRET is required for tasks E2E").toBeTruthy();
  const token = await encode({
    secret: secret!,
    maxAge: 60 * 60,
    token: {
      sub: person.id,
      email: "workspace-e2e@needt.local",
      role: "admin",
    },
  });
  await page.context().addCookies([
    {
      name: "next-auth.session-token",
      value: token,
      url: process.env.TEST_BASE_URL ?? "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function mockWorkspace(page: Page, canEdit = true) {
  let completed = false;
  let currentTitle = "Publish website";
  let updatePayload: unknown;
  let projectMutationPayload: unknown;
  let savedViewPayload: unknown;
  let removedSavedViewId: string | null = null;
  let healthUpdatePayload: unknown;
  let healthVersion = 1;
  let healthSummary = "Launch scope is clear";
  type SavedViewFixture = {
    id: string;
    name: string;
    userId: string;
    visibility: string;
    resource: string;
    queryVersion: number;
    type: string;
    groupBy: string | null;
    filters: Array<{
      field: string;
      operator: string;
      value: string | string[] | boolean | null;
    }>;
    sort: unknown[];
  };
  let savedViews: SavedViewFixture[] = [
    {
      id: "saved-view-done",
      name: "Completed board",
      userId: person.id,
      visibility: "PERSONAL",
      resource: "TASKS",
      queryVersion: 1,
      type: "board",
      groupBy: null,
      filters: [{ field: "status", operator: "in", value: ["completed"] }],
      sort: [],
    },
  ];

  const rawProject = {
    ...project,
    color: project.hue,
    icon: project.glyph,
    status: "active",
    description: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
  let rawTask = {
    ...task(),
    userId: person.id,
    workspaceId: workspace.id,
    projectId: project.id,
    project: rawProject,
    tags: [],
    description: "Launch copy and production checks",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/auth/session") {
      return route.fulfill({
        json: {
          user: {
            id: person.id,
            email: "workspace-e2e@needt.local",
            role: "admin",
          },
          expires: "2026-09-25T00:00:00.000Z",
        },
      });
    }
    if (url.pathname === "/api/workspaces") {
      return route.fulfill({
        json: {
          workspaces: [{ role: canEdit ? "OWNER" : "VIEWER", workspace }],
        },
      });
    }
    if (url.pathname === "/api/needt/workspace") {
      return route.fulfill({
        json: {
          workspaceId: workspace.id,
          now: "2026-09-24T08:00:00.000Z",
          todayKey: "2026-09-24",
          tasks: [
            task(completed, "task-e2e", currentTitle),
            task(false, "flow-task-e2e", "Open deployment"),
          ],
          projects: [project],
          people: [person],
          stages: [
            { id: "todo", name: "To do" },
            { id: "doing", name: "In progress" },
            { id: "review", name: "In review" },
            { id: "done", name: "Done" },
          ],
          canEdit,
        },
      });
    }
    if (url.pathname === "/api/tasks/task-e2e" && request.method() === "PUT") {
      updatePayload = JSON.parse(request.postData() ?? "{}");
      rawTask = { ...rawTask, ...(updatePayload as object) };
      if (typeof (updatePayload as { title?: unknown }).title === "string") {
        currentTitle = (updatePayload as { title: string }).title;
      }
      if ((updatePayload as { status?: string }).status === "completed") {
        completed = true;
      }
      return route.fulfill({ json: rawTask });
    }
    if (url.pathname === "/api/tasks") {
      return route.fulfill({ json: [rawTask] });
    }
    if (url.pathname === "/api/tags") {
      return route.fulfill({ json: [] });
    }
    if (url.pathname === "/api/projects") {
      return route.fulfill({ json: [rawProject] });
    }
    if (url.pathname === "/api/saved-views") {
      if (request.method() === "POST") {
        const payload = JSON.parse(request.postData() ?? "{}") as {
          name: string;
          visibility: string;
          type: string;
          filters: Array<{
            field: string;
            operator: string;
            value: string | string[] | boolean | null;
          }>;
          sort: unknown[];
        };
        savedViewPayload = payload;
        savedViews = [
          ...savedViews,
          {
            id: "saved-view-created",
            userId: person.id,
            resource: "TASKS",
            queryVersion: 1,
            groupBy: null,
            ...payload,
          },
        ];
        return route.fulfill({
          status: 201,
          json: { view: savedViews.at(-1) },
        });
      }
      return route.fulfill({ json: { views: savedViews } });
    }
    if (
      url.pathname.startsWith("/api/saved-views/") &&
      request.method() === "DELETE"
    ) {
      removedSavedViewId = url.pathname.split("/").at(-1) ?? null;
      savedViews = savedViews.filter((view) => view.id !== removedSavedViewId);
      return route.fulfill({ status: 204, body: "" });
    }
    if (url.pathname === `/api/projects/${project.id}/health`) {
      if (request.method() === "POST") {
        healthUpdatePayload = JSON.parse(request.postData() ?? "{}");
        healthVersion += 1;
        healthSummary = (healthUpdatePayload as { summary: string }).summary;
        return route.fulfill({
          status: 201,
          json: { update: { id: "health-update-e2e" }, healthVersion },
        });
      }
      return route.fulfill({
        json: {
          healthStatus: "AT_RISK",
          healthVersion,
          healthUpdatedAt: "2026-09-24T09:00:00.000Z",
          healthUpdates: [
            {
              id: `health-update-${healthVersion}`,
              status: "AT_RISK",
              summary: healthSummary,
              version: healthVersion,
              createdAt: "2026-09-24T09:00:00.000Z",
              author: { id: person.id, name: person.name, image: null },
            },
          ],
        },
      });
    }
    if (url.pathname === "/api/work-schedules") {
      return route.fulfill({ json: { schedules: [] } });
    }
    if (
      url.pathname === `/api/projects/${project.id}` &&
      request.method() === "PUT"
    ) {
      projectMutationPayload = JSON.parse(request.postData() ?? "{}");
      return route.fulfill({
        json: { ...rawProject, ...(projectMutationPayload as object) },
      });
    }
    return route.fulfill({ json: [] });
  });

  return {
    updatePayload: () => updatePayload,
    projectMutationPayload: () => projectMutationPayload,
    savedViewPayload: () => savedViewPayload,
    removedSavedViewId: () => removedSavedViewId,
    healthUpdatePayload: () => healthUpdatePayload,
  };
}

test("Tasks and Projects share the real workspace views and persist completion", async ({
  page,
}) => {
  await authenticate(page);
  const state = await mockWorkspace(page);

  await page.goto("/tasks");
  await expect(page.locator(".needt-v2:not(.needt-notices)")).toBeVisible();
  await expect(page.getByText(project.name).first()).toBeVisible();
  await expect(page.getByTitle("Publish website")).toBeVisible();
  await expect(page.getByText(person.name)).toBeVisible();

  await page.getByRole("button", { name: "Views" }).click();
  await page.getByRole("menuitem", { name: "Completed board" }).hover();
  await page.getByRole("menuitem", { name: "Apply view" }).click();
  await expect(page.getByRole("button", { name: "Kanban" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByRole("tab", { name: "Done" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await page.getByRole("button", { name: "List" }).click();
  await page.getByRole("tab", { name: "All" }).click();
  await page.getByRole("button", { name: "Views" }).click();
  await page.getByRole("menuitem", { name: "Save current view" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Launch view");
  await page.getByRole("button", { name: "Save view" }).click();
  await expect.poll(state.savedViewPayload).toEqual(
    expect.objectContaining({
      name: "Launch view",
      resource: "TASKS",
      type: "list",
      visibility: "PERSONAL",
      filters: [{ field: "status", operator: "not_in", value: ["completed"] }],
    })
  );
  await page.getByRole("button", { name: "Views" }).click();
  await page.getByRole("menuitem", { name: "Launch view" }).hover();
  await page.getByRole("menuitem", { name: "Remove view" }).click();
  await expect.poll(state.removedSavedViewId).toBe("saved-view-created");

  await page.getByTitle("Publish website").click();
  await expect(page.getByLabel("Task name")).toBeVisible();
  await expect(page.getByText("Auto-scheduled", { exact: true })).toBeVisible();
  await page.getByLabel("Task name").fill("Publish website v2");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect
    .poll(state.updatePayload)
    .toEqual(expect.objectContaining({ title: "Publish website v2" }));

  await page
    .getByRole("checkbox", { name: "Complete Publish website v2" })
    .click();
  await expect.poll(state.updatePayload).toEqual({ status: "completed" });
  await expect(page.getByText("Publish website v2")).toHaveCount(0);

  await page.goto("/projects");
  await expect(page.getByRole("button", { name: "Kanban" })).toBeVisible();
  await page.getByRole("tab", { name: "Done" }).click();
  await expect(page.getByText("Publish website v2")).toBeVisible();
  await page.getByRole("button", { name: "Kanban" }).click();
  await expect(page.getByText("In progress")).toBeVisible();
  await page.getByRole("button", { name: "Flow" }).click();
  await expect(page.getByText("Website launch").first()).toBeVisible();
  await expect(page.getByText("Open deployment").first()).toBeVisible();

  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(project.name);
  await page
    .getByRole("button", { name: `Health for ${project.name}` })
    .click();
  await expect(
    page.getByRole("heading", { name: "Project health" })
  ).toBeVisible();
  await expect(page.getByText("Launch scope is clear")).toBeVisible();
  await page.getByLabel("Update").fill("Waiting for launch approval");
  await page.getByRole("button", { name: "Post update" }).click();
  await expect.poll(state.healthUpdatePayload).toEqual({
    status: "AT_RISK",
    summary: "Waiting for launch approval",
    expectedVersion: 1,
  });
  await expect(page.getByText("Waiting for launch approval")).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Name").fill("Website launch v2");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect
    .poll(state.projectMutationPayload)
    .toEqual(expect.objectContaining({ name: "Website launch v2" }));
});

for (const width of [360, 390]) {
  test(`Workspace stays actionable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await authenticate(page);
    await mockWorkspace(page, false);

    await page.goto("/tasks");
    await expect(
      page.getByRole("heading", { name: workspace.name })
    ).toBeVisible();
    const mobileTask = page
      .getByRole("main")
      .getByText("Publish website", { exact: true })
      .last();
    await expect(mobileTask).toBeVisible();
    await expect(page.getByRole("button", { name: "Add task" })).toHaveCount(0);
    await page.goto("/projects");
    await expect(
      page.getByRole("button", { name: "Manage projects" })
    ).toHaveCount(0);
    await page.getByRole("button", { name: "View projects" }).click();
    await page
      .getByRole("button", { name: `Health for ${project.name}` })
      .click();
    await expect(page.getByText("Launch scope is clear")).toBeVisible();
    await expect(page.getByRole("button", { name: "Post update" })).toHaveCount(
      0
    );
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Close" }).click();
    await page.goto("/tasks");
    await mobileTask.click();
    await expect(page.getByText("Archive")).toHaveCount(0);
  });
}
