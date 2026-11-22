import { expect as baseExpect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";

import { enableAgentHub } from "./helpers/agent-hub";
import { type V3User, createV3User, signInAs } from "./helpers/v3-user";

/*
 * The roadmap on its two screens and through the API, on the real Postgres:
 *   - /projects/<id>/roadmap (desktop and phone);
 *   - Agents → Roadmap (desktop and phone);
 *   - GET /api/projects/<id>/roadmap, the same map for anything outside our UI.
 * On a phone the last station must end above the dock, whichever one sits at
 * the bottom of that screen. Shots go to test-results/roadmap, uploaded with
 * the e2e report.
 */
// The suite runs against : the first hit on a screen pays its compile.
const expect = baseExpect.configure({ timeout: 120_000 });

const OUT = path.join("test-results", "roadmap");
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

type Seeded = { user: V3User; projectId: string; ids: Record<string, string> };

/** done → now → waits on "Now" → next, then enough rows to scroll a phone. */
async function seed(label: string): Promise<Seeded> {
  const user = await createV3User(label);
  await enableAgentHub(user.id);
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      workspaceId: user.workspaceId,
      name: "Launch map",
    },
  });
  const ids: Record<string, string> = {};
  // Board order is creation order, so the rows are made one after another.
  async function make(
    key: string,
    title: string,
    extra: { status?: string; dependsOnId?: string } = {}
  ) {
    const task = await prisma.task.create({
      data: {
        userId: user.id,
        workspaceId: user.workspaceId,
        projectId: project.id,
        title,
        status: extra.status ?? "todo",
        dependsOnId: extra.dependsOnId,
        isAutoScheduled: false,
      },
    });
    ids[key] = task.id;
    return task;
  }
  await make("done", "Sign the lease", { status: "completed" });
  await make("now", "Build the shop", { status: "in_progress" });
  await make("blocked", "Open the doors", { dependsOnId: ids.now });
  await make("next", "Order the stock");
  for (let i = 1; i <= 9; i++) await make(`more${i}`, `Later step ${i}`);
  // An agent on the milestone that is in progress.
  const agent = await prisma.hubAgent.create({
    data: {
      userId: user.id,
      workspaceId: user.workspaceId,
      connectionKey: `roadmap-spec:${user.id}`,
      name: "Claude",
      kind: "other",
      skills: [],
    },
  });
  await prisma.hubItem.create({
    data: {
      userId: user.id,
      workspaceId: user.workspaceId,
      title: "Build the shop (agent)",
      goal: "Build it.",
      doneCriteria: "Done",
      criteriaItems: [],
      context: "",
      risks: [],
      status: "in_progress",
      creatorKind: "owner",
      assigneeAgentId: agent.id,
      claimedByAgentId: agent.id,
      taskId: ids.now,
      projectId: project.id,
    },
  });
  return { user, projectId: project.id, ids };
}

async function phoneContext(browser: import("@playwright/test").Browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    serviceWorkers: "block",
  });
  await context.addCookies([{ name: "needt-ui", value: "phone", url: BASE }]);
  return context;
}

/** The first visit to Agents shows its setup; the tabs start past it. */
async function skipAgentsSetup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("needt:agents-onboarded", "1");
  });
}

/** Scroll the screen to its end, wherever the scroller is. */
async function scrollToEnd(page: Page) {
  await page.evaluate(() => {
    const last = document.querySelector("[data-rm-station]:last-of-type");
    const rows = document.querySelectorAll("[data-rm-station]");
    let node: HTMLElement | null =
      (rows[rows.length - 1] as HTMLElement | undefined) ??
      (last as HTMLElement | null);
    while (node) {
      const cs = getComputedStyle(node);
      if (
        /(auto|scroll)/.test(cs.overflowY) &&
        node.scrollHeight > node.clientHeight
      )
        node.scrollTop = node.scrollHeight;
      node = node.parentElement;
    }
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(400);
}

/** Pixels between the last station and the top of the dock under it. */
async function roomAboveDock(page: Page) {
  return page.evaluate(() => {
    const rows = document.querySelectorAll("[data-rm-station]");
    const last = rows[rows.length - 1]?.getBoundingClientRect();
    const tops = [".ag-tabs.ag-dock", ".nfb-pill", ".pk-fog-wash"]
      .flatMap((sel) => [...document.querySelectorAll(sel)])
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.height > 0 && r.top > window.innerHeight / 2)
      .map((r) => r.top);
    return {
      lastBottom: last ? last.bottom : -1,
      found: tops.length,
      dockTop: tops.length ? Math.min(...tops) : window.innerHeight,
    };
  });
}

test.use({ navigationTimeout: 180_000 });

test.describe("Roadmap entry points", () => {
  test.beforeAll(async () => {
    await mkdir(OUT, { recursive: true });
  });

  test("API: GET /api/projects/<id>/roadmap returns the computed map", async ({
    page,
  }) => {
    const { user, projectId, ids } = await seed("roadmap-api");
    await signInAs(page, user);

    const res = await page.request.get(
      `${BASE}/api/projects/${projectId}/roadmap`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.project).toMatchObject({ id: projectId, name: "Launch map" });
    const byId = new Map<string, { state: string; hub: { agent: string }[] }>(
      body.roadmap.stations.map(
        (s: { id: string; state: string; hub: { agent: string }[] }) => [
          s.id,
          s,
        ]
      )
    );
    expect(body.roadmap.stations).toHaveLength(13);
    expect(byId.get(ids.done)?.state).toBe("done");
    expect(byId.get(ids.now)?.state).toBe("current");
    expect(byId.get(ids.blocked)?.state).toBe("blocked");
    expect(byId.get(ids.next)?.state).toBe("next");
    expect(byId.get(ids.now)?.hub[0]?.agent).toBe("Claude");
    expect(body.roadmap.current.id).toBe(ids.now);

    // `?hub=0` leaves the agents out; the stations are the same.
    const plain = await (
      await page.request.get(`${BASE}/api/projects/${projectId}/roadmap?hub=0`)
    ).json();
    expect(plain.roadmap.stations).toHaveLength(13);
    expect(plain.roadmap.stations[1].hub).toEqual([]);

    // Another account reads a 404, never the map; no session reads a 401.
    const other = await createV3User("roadmap-api-other");
    const otherCtx = await page.context().browser()!.newContext();
    const otherPage = await otherCtx.newPage();
    await signInAs(otherPage, other);
    const denied = await otherPage.request.get(
      `${BASE}/api/projects/${projectId}/roadmap`
    );
    expect(denied.status()).toBe(404);
    await otherCtx.close();
    const anon = await page.context().browser()!.newContext();
    const noSession = await anon.request.get(
      `${BASE}/api/projects/${projectId}/roadmap`
    );
    expect(noSession.status()).toBe(401);
    await anon.close();
  });

  test("desktop: Projects → Roadmap and Agents → Roadmap", async ({ page }) => {
    test.setTimeout(420_000);
    const { user, projectId, ids } = await seed("roadmap-desktop");
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAs(page, user);
    await skipAgentsSetup(page);

    await page.goto(`/projects/${projectId}/roadmap`);
    await expect(page.locator(`[data-rm-page="${projectId}"]`)).toBeVisible({
      timeout: 120_000,
    });
    const stations = page.locator("[data-rm-station]");
    await expect(stations).toHaveCount(13);
    await expect(
      page.locator(`[data-rm-station="${ids.done}"]`)
    ).toHaveAttribute("data-rm-state", "done");
    await expect(
      page.locator(`[data-rm-station="${ids.now}"]`)
    ).toHaveAttribute("data-rm-state", "current");
    await expect(
      page.locator(`[data-rm-station="${ids.blocked}"]`)
    ).toHaveAttribute("data-rm-state", "blocked");
    await page.screenshot({ path: path.join(OUT, "desktop-project.png") });
    await page.locator(`[data-rm-station="${ids.next}"]`).click();
    await expect(page).toHaveURL(new RegExp(`task=${ids.next}`));
    await page.keyboard.press("Escape");

    await page.goto("/agents?tab=roadmap");
    await expect(page.locator(`[data-rm-agents="${projectId}"]`)).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("[data-rm-station]")).toHaveCount(13);
    // The agent on the milestone that is in progress is named on its row.
    await expect(
      page.locator(`[data-rm-station="${ids.now}"] [data-rm-agent]`)
    ).toContainText("Claude");
    await page.screenshot({ path: path.join(OUT, "desktop-agents.png") });

    // The tab is also reachable by clicking it.
    await page.goto("/agents");
    await page.locator('[data-ag-tab="roadmap"]').click();
    await expect(page.locator(`[data-rm-agents="${projectId}"]`)).toBeVisible();
  });

  test("phone: Projects → Roadmap ends above the dock", async ({ browser }) => {
    test.setTimeout(420_000);
    const { user, projectId } = await seed("roadmap-phone-project");
    const context = await phoneContext(browser);
    const page = await context.newPage();
    await signInAs(page, user);

    await page.goto(`/projects/${projectId}/roadmap`);
    await page.locator('.needt-v3[data-ui="phone"]').waitFor();
    await expect(page.locator("[data-rm-station]")).toHaveCount(13, {
      timeout: 120_000,
    });
    await page.screenshot({ path: path.join(OUT, "phone-project.png") });
    await scrollToEnd(page);
    const room = await roomAboveDock(page);
    expect(room.found).toBeGreaterThan(0);
    expect(room.lastBottom).toBeGreaterThan(0);
    expect(room.lastBottom).toBeLessThanOrEqual(room.dockTop - 8);
    await page.screenshot({ path: path.join(OUT, "phone-project-end.png") });
    await context.close();
  });

  test("phone: Agents → Roadmap ends above the dock", async ({ browser }) => {
    test.setTimeout(420_000);
    const { user, projectId } = await seed("roadmap-phone-agents");
    const context = await phoneContext(browser);
    const page = await context.newPage();
    await signInAs(page, user);
    await skipAgentsSetup(page);

    await page.goto("/agents?tab=roadmap");
    await page.locator('.needt-v3[data-ui="phone"]').waitFor();
    await expect(page.locator(`[data-rm-agents="${projectId}"]`)).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("[data-rm-station]")).toHaveCount(13);
    await page.screenshot({ path: path.join(OUT, "phone-agents.png") });
    await scrollToEnd(page);
    const room = await roomAboveDock(page);
    expect(room.found).toBeGreaterThan(0);
    expect(room.lastBottom).toBeGreaterThan(0);
    expect(room.lastBottom).toBeLessThanOrEqual(room.dockTop - 8);
    await page.screenshot({ path: path.join(OUT, "phone-agents-end.png") });
    await context.close();
  });
});
