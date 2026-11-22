import { type Page, expect, test } from "@playwright/test";

import { prisma } from "@/lib/prisma";

import { enableAgentHub } from "../helpers/agent-hub";
import { VISUAL_TEST_EMAIL, VISUAL_TEST_NOW } from "./fixtures";
import { signInVisualUser } from "./helpers";

/*
 * The roadmap on its two screens: Projects → a project → Roadmap and
 * Agents → Roadmap. Desktop (the 1440 project) and a 390-px phone (the mobile
 * project at its own width), dark app theme. The tasks are written to the
 * visual user's database with fixed ids and dates, the hub is served from a
 * fixture, so the shots do not move with the data or the day.
 */
const PROJECT_ID = "visual-roadmap-project";
const at = (minutesAgo: number) =>
  new Date(
    new Date(VISUAL_TEST_NOW).getTime() - minutesAgo * 60_000
  ).toISOString();

const STEPS: {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "completed";
  dependsOn?: string;
}[] = [
  { id: "vr-1", title: "Sign the lease", status: "completed" },
  { id: "vr-2", title: "Fit out the shop", status: "completed" },
  { id: "vr-3", title: "Photograph the first drop", status: "in_progress" },
  { id: "vr-4", title: "Open the web shop", status: "todo", dependsOn: "vr-3" },
  { id: "vr-5", title: "Order the packaging", status: "todo" },
  { id: "vr-6", title: "Plan the launch week", status: "todo" },
  { id: "vr-7", title: "Hire a second pair of hands", status: "todo" },
];

const json = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

const OVERVIEW = {
  agents: [
    {
      id: "a1",
      name: "Claude",
      kind: "other",
      skills: ["writing", "research"],
      connection: "MCP",
      openItems: 1,
      heldItems: 1,
      lastSeenAt: at(2),
      limits: null,
      token: { preview: "nt_…a1", revoked: false, lastUsedAt: at(5) },
    },
  ],
  items: [
    {
      id: "vr-item-1",
      title: "Edit the drop photos",
      status: "in_progress",
      goal: "Edit the photos of the first drop.",
      doneCriteria: "Edited",
      criteria: [{ text: "Edited", met: false }],
      risks: [],
      approvals: {},
      assignee: { id: "a1", name: "Claude" },
      heldBy: { name: "Claude" },
      leaseExpiresAt: at(-60),
      leaseExpired: false,
      question: null,
      noCapableAgent: false,
      ownerUnread: false,
      result: null,
      latestEvent: null,
      updatedAt: at(4),
      taskId: "vr-3",
      projectId: PROJECT_ID,
    },
  ],
  notes: [],
  reservations: [],
  graph: null,
};

async function serveHub(page: Page) {
  await page.route("**/api/agent-hub/overview**", (r) =>
    r.fulfill(json(OVERVIEW))
  );
  await page.route("**/api/agent-hub/messages/**", (r) =>
    r.fulfill(json({ messages: [] }))
  );
  await page.route("**/api/agent-hub/messages", (r) =>
    r.request().method() === "GET"
      ? r.fulfill(json({ threads: [] }))
      : r.continue()
  );
  await page.route("**/api/agent-hub/activity**", (r) =>
    r.fulfill(json({ events: [] }))
  );
  await page.route("**/api/agent-hub/recurrences**", (r) =>
    r.fulfill(json({ recurrences: [] }))
  );
  await page.route("**/api/agent-hub/webhooks**", (r) =>
    r.fulfill(json({ webhooks: [] }))
  );
  await page.route("**/api/agent-hub/badge**", (r) =>
    r.fulfill(json({ enabled: true, unread: 0 }))
  );
}

async function prepare(page: Page) {
  await page.clock.setFixedTime(new Date(VISUAL_TEST_NOW));
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
    localStorage.setItem("needt:agents-onboarded", "1");
  });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const user = await prisma.user.findUnique({
    where: { email: VISUAL_TEST_EMAIL },
    select: { id: true },
  });
  expect(user).toBeTruthy();
  await enableAgentHub(user!.id);
  await signInVisualUser(page);
  await serveHub(page);
  const workspace = await prisma.workspace.findUnique({
    where: { personalOwnerId: user!.id },
    select: { id: true },
  });
  await removeFixture(user!.id);
  await prisma.project.create({
    data: {
      id: PROJECT_ID,
      userId: user!.id,
      workspaceId: workspace!.id,
      name: "Shop launch",
    },
  });
  // Board order is the order of creation: fixed, a minute apart.
  const base = new Date(VISUAL_TEST_NOW).getTime() - 60 * 60_000;
  for (const [i, s] of STEPS.entries()) {
    await prisma.task.create({
      data: {
        id: s.id,
        userId: user!.id,
        workspaceId: workspace!.id,
        projectId: PROJECT_ID,
        title: s.title,
        status: s.status,
        dependsOnId: s.dependsOn,
        isAutoScheduled: false,
        createdAt: new Date(base + i * 60_000),
      },
    });
  }
  const res = await page.request.patch("/api/user-settings", {
    data: { theme: "dark" },
  });
  expect(res.ok()).toBeTruthy();
}

async function removeFixture(userId: string) {
  await prisma.task.deleteMany({ where: { userId, projectId: PROJECT_ID } });
  await prisma.project.deleteMany({ where: { id: PROJECT_ID, userId } });
}

async function settle(page: Page) {
  await page.addStyleTag({
    content:
      'nextjs-portal, .tsqd-parent-container, aside[aria-label="Quick Tip"] { display: none !important; }',
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
  });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
}

// The fixture is for this spec only: later specs share the visual user, and a
// project in their sidebar would move their baselines.
test.afterAll(async () => {
  const user = await prisma.user.findUnique({
    where: { email: VISUAL_TEST_EMAIL },
    select: { id: true },
  });
  if (user) {
    await removeFixture(user.id);
    await prisma.featureFlagOverride.deleteMany({
      where: { flagKey: "agent_hub", userId: user.id },
    });
  }
});

test.describe("desktop", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "1440-px shots run once");
  });

  test("Projects → Roadmap", async ({ page }) => {
    await prepare(page);
    await page.goto(`/projects/${PROJECT_ID}/roadmap`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("[data-rm-station]")).toHaveCount(STEPS.length);
    await settle(page);
    await expect(page).toHaveScreenshot("roadmap-project-desktop.png", {
      fullPage: false,
    });
  });

  test("Agents → Roadmap", async ({ page }) => {
    await prepare(page);
    await page.goto("/agents?tab=roadmap", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-rm-station]")).toHaveCount(STEPS.length);
    await expect(page.locator("[data-rm-agent]")).toHaveCount(1);
    await settle(page);
    await expect(page).toHaveScreenshot("roadmap-agents-desktop.png", {
      fullPage: false,
    });
  });
});

test.describe("phone, 390 px", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "mobile", "390-px phone shots run once");
  });

  test("Projects → Roadmap", async ({ page, context, baseURL }) => {
    await context.addCookies([
      { name: "needt-ui", value: "phone", url: baseURL! },
    ]);
    await prepare(page);
    await page.goto(`/projects/${PROJECT_ID}/roadmap`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("[data-rm-station]")).toHaveCount(STEPS.length);
    await settle(page);
    await expect(page).toHaveScreenshot("roadmap-project-phone.png", {
      fullPage: false,
    });
  });

  test("Agents → Roadmap", async ({ page, context, baseURL }) => {
    await context.addCookies([
      { name: "needt-ui", value: "phone", url: baseURL! },
    ]);
    await prepare(page);
    await page.goto("/agents?tab=roadmap", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-rm-station]")).toHaveCount(STEPS.length);
    await settle(page);
    await expect(page).toHaveScreenshot("roadmap-agents-phone.png", {
      fullPage: false,
    });
  });
});
