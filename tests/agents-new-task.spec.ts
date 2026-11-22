import { expect, test } from "@playwright/test";

import { prisma } from "@/lib/prisma";

import { enableAgentHub, seedAgentHub } from "./helpers/agent-hub";
import { createV3User, signInAs } from "./helpers/v3-user";

/*
 * The finished Agents screen on the real stack: the owner's "New task" hands
 * a brief to an agent through POST /api/agent-hub/items (the create the MCP
 * tool needt_agent_task_create runs), and on a phone the tab bar and the last
 * cards stand above the app's own bottom dock.
 */

test.describe("Agents: New task", () => {
  test("the owner creates a task for an agent from the Tasks tab", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const user = await createV3User("agents-new-task");
    await enableAgentHub(user.id);
    const agent = await prisma.hubAgent.create({
      data: {
        userId: user.id,
        workspaceId: user.workspaceId,
        connectionKey: `new-task:${user.id}`,
        name: "Writer bot",
        kind: "other",
        skills: ["writing"],
        lastSeenAt: new Date(),
      },
    });
    await signInAs(page, user);
    await page.addInitScript(() => {
      localStorage.setItem("needt:agents-onboarded", "1");
    });
    await page.goto("/agents?tab=tasks");
    await expect(page.locator("[data-ag-new-task-open]")).toBeVisible({
      timeout: 60_000,
    });

    await page.locator("[data-ag-new-task-open]").click();
    const form = page.locator("[data-ag-new-task]");
    await expect(form).toBeVisible();

    // A brief that is not ready says what is missing and sends nothing.
    await form.locator("[data-ag-new-title]").fill("Draft the launch thread");
    await form.locator("[data-ag-new-submit]").click();
    await expect(form.getByRole("alert")).toContainText("20 characters");
    expect(await prisma.hubItem.count({ where: { userId: user.id } })).toBe(0);

    await form
      .locator("[data-ag-new-goal]")
      .fill("Write the launch thread for the brand account, five posts.");
    await form.locator("[data-ag-new-done]").fill("Five posts are drafted");
    await form.locator("[data-ag-new-agent]").selectOption(agent.id);
    await form.getByRole("button", { name: "Publishes" }).click();
    await form.locator("[data-ag-new-submit]").click();

    await expect(form).toBeHidden();
    await expect(
      page.locator("[data-ag-item]", { hasText: "Draft the launch thread" })
    ).toBeVisible();

    const made = await prisma.hubItem.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(made).toMatchObject({
      title: "Draft the launch thread",
      creatorKind: "owner",
      assigneeAgentId: agent.id,
      status: "open",
      risks: ["publish"],
    });
    // The hub's own minimum (40 characters of context) was filled in.
    expect(made.context.length).toBeGreaterThanOrEqual(40);
  });

  test("an empty Tasks tab has no Show older link", async ({ page }) => {
    test.setTimeout(120_000);
    const user = await createV3User("agents-no-older");
    await enableAgentHub(user.id);
    await signInAs(page, user);
    await page.addInitScript(() => {
      localStorage.setItem("needt:agents-onboarded", "1");
    });
    await page.goto("/agents?tab=tasks");
    await expect(page.locator("[data-ag-tasks]")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole("button", { name: "Show older" })).toHaveCount(
      0
    );
  });
});

test.describe("Agents on a phone", () => {
  test("the tab bar and the last card clear the app's bottom dock", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    const user = await createV3User("agents-phone-dock");
    await enableAgentHub(user.id);
    await seedAgentHub(user.id, user.workspaceId, { agents: 3, items: 18 });
    await signInAs(page, user);
    await context.addCookies([
      {
        name: "needt-ui",
        value: "phone",
        url: process.env.TEST_BASE_URL ?? "http://localhost:3000",
      },
    ]);
    await page.addInitScript(() => {
      localStorage.setItem("needt:agents-onboarded", "1");
    });
    await page.goto("/agents?tab=tasks");
    await page.locator('.needt-v3[data-ui="phone"]').waitFor();
    await expect(page.locator("[data-ag-item]").first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator("[data-nva-pill]")).toBeVisible();

    const clears = async (what: string) => {
      const room = await page.evaluate(() => {
        const top = (selector: string) => {
          const el = document.querySelector(selector);
          return el ? el.getBoundingClientRect().top : null;
        };
        const bottom = (selector: string) => {
          const el = document.querySelector(selector);
          return el ? el.getBoundingClientRect().bottom : null;
        };
        return {
          dock: top("[data-nva-pill]"),
          tabs: bottom(".ag-tabs"),
          composer: bottom(".ag-composer"),
        };
      });
      expect(room.dock, `${what}: the app dock is on screen`).not.toBeNull();
      expect(
        room.tabs,
        `${what}: the tab bar ends above the dock`
      ).toBeLessThanOrEqual(room.dock! - 4);
      if (room.composer !== null)
        expect(
          room.composer,
          `${what}: the input ends above the tab bar`
        ).toBeLessThanOrEqual(room.dock!);
    };

    for (const tab of [
      "tasks",
      "agents",
      "activity",
      "memory",
      "map",
      "chat",
    ]) {
      await page.locator(`[data-ag-tab="${tab}"]`).click();
      await page.waitForTimeout(400);
      await clears(tab);
    }

    // The last row of a long list scrolls clear of the tab bar too.
    await page.locator('[data-ag-tab="tasks"]').click();
    await expect(page.locator("[data-ag-item]").first()).toBeVisible();
    await page.locator(".ag-scroll").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(300);
    const gap = await page.evaluate(() => {
      const rows = document.querySelectorAll("[data-ag-item]");
      const last = rows[rows.length - 1].getBoundingClientRect().bottom;
      const tabs = document.querySelector(".ag-tabs")!.getBoundingClientRect();
      return tabs.top - last;
    });
    expect(gap).toBeGreaterThanOrEqual(0);
    await context.close();
  });
});
