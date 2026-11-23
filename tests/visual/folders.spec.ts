import { type Page, expect, test } from "@playwright/test";

import { prisma } from "@/lib/prisma";

import { VISUAL_TEST_EMAIL, VISUAL_TEST_NOW } from "./fixtures";
import { signInVisualUser } from "./helpers";

/*
 * Folders in Projects and Docs, the six looks side by side: eight projects,
 * six with a chosen look (1..6) and two on Auto (a look from the id), each
 * with real tasks, pages and update times, one with connected task apps. The
 * clock is frozen at VISUAL_TEST_NOW so "Updated 2h" never drifts. The
 * Projects grid, the Docs grid and the Folder style picker, light and dark,
 * on a 1440-px desktop and a 390-px phone.
 */

const ID = (n: number) => `visual-fl-${n}`;
const NOW = new Date(VISUAL_TEST_NOW).getTime();
const HOUR = 3_600_000;

const PROJECTS = [
  { n: 1, name: "Demesures drop", color: "#d1622a", style: 1, ago: 2 * HOUR },
  { n: 2, name: "Needt launch", color: "#1f9a8a", style: 2, ago: 12 * 60_000 },
  { n: 3, name: "Reselling", color: "#2e9d5b", style: 3, ago: 70 * HOUR },
  { n: 4, name: "German B1", color: "#8b6cf0", style: 4, ago: 26 * HOUR },
  { n: 5, name: "Photo shoots", color: "#2e6de9", style: 5, ago: 5 * HOUR },
  { n: 6, name: "Taxes and RAV", color: "#c2417a", style: 6, ago: 30 * HOUR },
  { n: 7, name: "Home", color: "#e07a5f", style: null, ago: 3 * HOUR },
  { n: 8, name: "Reading list", color: "#7b8794", style: null, ago: 50 * HOUR },
] as const;

const TASKS = [
  "Approve the sample",
  "Shoot the lookbook",
  "Write the product copy",
];

const todayKey = VISUAL_TEST_NOW.slice(0, 10);

async function seed() {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: VISUAL_TEST_EMAIL },
    select: { id: true },
  });
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { personalOwnerId: user.id },
    select: { id: true },
  });
  for (const p of PROJECTS) {
    await prisma.project.create({
      data: {
        id: ID(p.n),
        name: p.name,
        color: p.color,
        folderStyle: p.style,
        position: p.n,
        userId: user.id,
        workspaceId: workspace.id,
        createdAt: new Date(NOW - 100 * 24 * HOUR),
        updatedAt: new Date(NOW - p.ago),
      },
    });
    for (const [i, title] of TASKS.entries()) {
      await prisma.task.create({
        data: {
          id: `${ID(p.n)}-t${i}`,
          title: `${title}`,
          userId: user.id,
          workspaceId: workspace.id,
          projectId: ID(p.n),
          status: "todo",
          isAutoScheduled: false,
          estimatedMinutes: 30,
          duration: 30,
          // the first project has everything due today, the rest spread out
          dueDate: new Date(
            `${
              p.n === 1
                ? todayKey
                : new Date(NOW + (i + p.n) * 24 * HOUR)
                    .toISOString()
                    .slice(0, 10)
            }T00:00:00.000Z`
          ),
        },
      });
    }
    // two pages per project (the Docs folders)
    for (const [i, title] of [`${p.name} notes`, `${p.name} plan`].entries()) {
      await prisma.page.create({
        data: {
          id: `${ID(p.n)}-d${i}`,
          title,
          userId: user.id,
          workspaceId: workspace.id,
          projectId: ID(p.n),
          createdAt: new Date(NOW - 100 * 24 * HOUR),
          updatedAt: new Date(NOW - p.ago - i * HOUR),
        },
      });
    }
  }
  // photo shoots syncs with Google Tasks and Outlook; nothing else is connected
  for (const [type, name] of [
    ["google", "Google Tasks"],
    ["outlook", "Outlook Tasks"],
  ] as const) {
    const provider = await prisma.taskProvider.create({
      data: { id: `visual-fl-prov-${type}`, userId: user.id, type, name },
    });
    await prisma.taskListMapping.create({
      data: {
        providerId: provider.id,
        projectId: ID(5),
        externalListId: `visual-fl-list-${type}`,
        externalListName: name,
      },
    });
  }
}

test.afterEach(async () => {
  await prisma.taskListMapping.deleteMany({
    where: { projectId: { startsWith: "visual-fl-" } },
  });
  await prisma.taskProvider.deleteMany({
    where: { id: { startsWith: "visual-fl-prov-" } },
  });
  await prisma.page.deleteMany({ where: { id: { startsWith: "visual-fl-" } } });
  await prisma.task.deleteMany({ where: { id: { startsWith: "visual-fl-" } } });
  await prisma.project.deleteMany({
    where: { id: { startsWith: "visual-fl-" } },
  });
});

async function open(page: Page, theme: "dark" | "light", path: string) {
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
  });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date(VISUAL_TEST_NOW));
  await signInVisualUser(page);
  await seed();
  const res = await page.request.patch("/api/user-settings", {
    data: { theme },
  });
  expect(res.ok()).toBeTruthy();
  await page.goto(path);
  await page.addStyleTag({
    content:
      'nextjs-portal, .tsqd-parent-container, aside[aria-label="Quick Tip"] { display: none !important; }',
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

const looks = (page: Page, sel: string) =>
  page
    .locator(`${sel} .fl`)
    .evaluateAll((els) => els.map((e) => /fl-v([1-6])/.exec(e.className)?.[1]));

for (const size of ["desktop", "phone"] as const) {
  test.describe(`Folders, ${size}`, () => {
    test.use(
      size === "phone"
        ? {
            viewport: { width: 390, height: 844 },
            hasTouch: true,
            isMobile: true,
            serviceWorkers: "block",
          }
        : { viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" }
    );
    test.beforeEach(({}, info) => {
      test.skip(
        info.project.name !== (size === "phone" ? "mobile" : "desktop"),
        `${size} shots run once`
      );
    });
    const px = size === "phone" ? 390 : 1440;

    for (const theme of ["light", "dark"] as const) {
      test(`Projects grid, mixed looks, ${theme}`, async ({ page }) => {
        await open(page, theme, "/projects");
        const grid = page.locator(
          size === "phone" ? ".ptk-plist.is-folders" : "[data-wk-pgrid]"
        );
        await expect(grid.locator(".fl")).toHaveCount(PROJECTS.length, {
          timeout: 60_000,
        });
        // the six chosen looks wear themselves; look 5 has its two apps
        expect(await looks(page, "")).toEqual(
          expect.arrayContaining(["1", "2", "3", "4", "5", "6"])
        );
        await expect(grid.locator(".fl-v5 [data-fl-app]")).toHaveCount(2);
        // no pill or avatar is drawn for data a project does not have
        await expect(grid.locator("[data-fl-members]")).toHaveCount(0);
        await page.waitForTimeout(400);
        await expect(grid).toHaveScreenshot(
          `projects-grid-${px}-${theme}.png`,
          {
            animations: "disabled",
          }
        );
      });

      test(`Docs grid, mixed looks, ${theme}`, async ({ page }) => {
        await open(page, theme, "/pages");
        const grid = page.locator("[data-docs-folders]");
        // the eight projects, plus Unsorted (the seeded "Visual design notes"
        // page belongs to no project)
        await expect(grid.locator(".fl")).toHaveCount(PROJECTS.length + 1, {
          timeout: 60_000,
        });
        await page.waitForTimeout(400);
        await expect(grid).toHaveScreenshot(`docs-grid-${px}-${theme}.png`, {
          animations: "disabled",
        });
      });

      test(`Folder style picker, ${theme}`, async ({ page }) => {
        await open(page, theme, `/projects/${ID(2)}?rename=1`);
        if (size === "phone") {
          // the phone has no ?rename flag: project options, then Edit project
          await page.getByRole("button", { name: "Project options" }).click();
          await page.getByRole("button", { name: /Edit project/ }).click();
        }
        const picker = page.locator("[data-folder-style-picker]");
        await expect(picker).toBeVisible({ timeout: 60_000 });
        await expect(picker.getByRole("radio")).toHaveCount(7);
        await expect(
          picker.locator('[data-folder-style-option="2"]')
        ).toHaveAttribute("aria-checked", "true");
        await page.waitForTimeout(400);
        await expect(picker).toHaveScreenshot(
          `folder-style-picker-${px}-${theme}.png`,
          { animations: "disabled" }
        );
      });
    }
  });
}
