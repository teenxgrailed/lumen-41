import { type Page, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";

import { createV3User, signInAs } from "../helpers/v3-user";

/*
 * Task window open: click a row in Tasks > Today (40 tasks, one of them with
 * 4 subtasks, a description, a project, a label, a priority and a duration)
 * and time click -> the first frame in which the task card is on screen.
 * Also the frame gaps and long tasks from the click until the 160 ms open
 * animation has finished. Desktop only (the phone opens its own sheet).
 * Runs on desktop-chromium (CPU 2x) and desktop-webkit (Safari engine, no
 * CDP, so no throttle and no longtask API: "long frames" = rAF gaps > 50 ms).
 * One JSON per project lands in perf/modal.
 */
const OUT = "perf/modal";
const TASKS = 40;
const RUNS = 8; // the first is the cold open, kept apart

type Run = {
  visibleMs: number | null;
  frames: number;
  maxGapMs: number;
  slowFrames: number; // gaps over 20 ms (below ~50 fps)
  longTasks: number | null;
  longTaskMs: number | null;
  longFrames: number; // gaps over 50 ms
};

const RECORDER = () => {
  const w = window as unknown as { __modal: unknown };
  let t0 = 0;
  let tVisible: number | null = null;
  let stamps: number[] = [];
  const longs: number[] = [];
  let armed = false;
  let supported = true;
  try {
    new PerformanceObserver((l) => {
      if (armed) for (const e of l.getEntries()) longs.push(e.duration);
    }).observe({ entryTypes: ["longtask"] });
  } catch {
    supported = false;
  }
  document.addEventListener(
    "click",
    () => {
      if (armed) return;
      armed = true;
      t0 = performance.now();
      tVisible = null;
      stamps = [];
      longs.length = 0;
      const tick = (t: number) => {
        stamps.push(t);
        if (tVisible === null) {
          const card = document.querySelector(".tdc-card");
          // the frame after the card is in the DOM is the first one it can
          // have been painted in
          if (card && card.getBoundingClientRect().width > 0) tVisible = t;
        }
        if (t - t0 < 900) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    true
  );
  w.__modal = {
    read(): unknown {
      armed = false;
      const gaps = stamps.slice(1).map((t, i) => t - stamps[i]);
      // until the 160 ms animation has played after the card appeared
      const end = (tVisible ?? t0) + 200;
      const win: number[] = [];
      for (let i = 1; i < stamps.length; i++)
        if (stamps[i] <= end) win.push(stamps[i] - stamps[i - 1]);
      return {
        visibleMs: tVisible === null ? null : tVisible - t0,
        frames: win.length,
        maxGapMs: Math.max(0, ...win),
        slowFrames: win.filter((g) => g > 20).length,
        longFrames: win.filter((g) => g > 50).length,
        longTasks: supported ? longs.length : null,
        longTaskMs: supported ? longs.reduce((a, b) => a + b, 0) : null,
        allGaps: gaps.length,
      };
    },
  };
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return r1(s[Math.floor(s.length / 2)]);
};

async function openOnce(page: Page, id: string): Promise<Run> {
  await page.locator(`[data-task="${id}"]`).first().click({ timeout: 15_000 });
  await page.locator(".tdc-card").waitFor({ timeout: 15_000 });
  await page.waitForTimeout(900);
  const run = await page.evaluate(() =>
    (window as unknown as { __modal: { read(): Run } }).__modal.read()
  );
  await page.keyboard.press("Escape");
  await page
    .locator(".tdc-card")
    .waitFor({ state: "detached", timeout: 15_000 });
  await page.waitForTimeout(500);
  return run;
}

test("perf: task-modal-open", async ({ context, page, browserName }, info) => {
  const project = info.project.name;
  test.skip(project.startsWith("iphone"), "desktop only");
  const write = async (data: Record<string, unknown>) => {
    await mkdir(OUT, { recursive: true });
    await writeFile(
      path.join(OUT, `${project}.json`),
      JSON.stringify({ project, browser: browserName, ...data }, null, 2)
    );
  };
  try {
    await context.addInitScript(RECORDER);
    await context.addInitScript(() => {
      try {
        localStorage.setItem("needt:agents-onboarded", "1");
      } catch {
        // storage off: nothing to skip
      }
    });
    const user = await createV3User("perf-modal");
    const now = new Date();
    const noon = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12)
    );
    const proj = await prisma.project.create({
      data: {
        name: "Perf project",
        color: "#7c5cff",
        userId: user.id,
        workspaceId: user.workspaceId,
      },
    });
    const tag = await prisma.tag.create({
      data: { name: "perf-label", color: "#2f9e44", userId: user.id },
    });
    await prisma.task.createMany({
      data: Array.from({ length: TASKS - 1 }, (_, i) => ({
        userId: user.id,
        workspaceId: user.workspaceId,
        title: `Perf today task ${i + 1}`,
        status: "todo",
        estimatedMinutes: 30 + (i % 4) * 15,
        duration: 30 + (i % 4) * 15,
        startDate: noon,
        dueDate: noon,
        ...(i % 3 === 0 ? { projectId: proj.id } : {}),
        ...(i % 5 === 0 ? { priority: "high" } : {}),
      })),
    });
    const rich = await prisma.task.create({
      data: {
        userId: user.id,
        workspaceId: user.workspaceId,
        title: "Perf modal task",
        description:
          "Plan the release: collect the notes, check the open issues, write the summary and send it round before the end of the day. Keep it short.",
        status: "todo",
        estimatedMinutes: 60,
        duration: 60,
        startDate: noon,
        dueDate: noon,
        priority: "high",
        projectId: proj.id,
        tags: { connect: [{ id: tag.id }] },
      },
    });
    await prisma.taskPart.createMany({
      data: ["Collect notes", "Check issues", "Write summary", "Send it"].map(
        (title, i) => ({ taskId: rich.id, title, position: i + 1 })
      ),
    });
    await signInAs(page, user);
    await context.addCookies([
      {
        name: "needt-ui",
        value: "desktop",
        url: process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000",
      },
    ]);
    const cdp =
      browserName === "chromium" ? await context.newCDPSession(page) : null;
    if (cdp) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 2 });

    await page.goto("/tasks", { waitUntil: "load" });
    await page.locator(".needt-v3").waitFor({ timeout: 45_000 });
    await page.locator(`[data-task="${rich.id}"]`).first().waitFor({
      timeout: 45_000,
    });
    await page.waitForTimeout(2500);
    const rows = await page.locator("[data-task]").count();

    const runs: Run[] = [];
    for (let i = 0; i < RUNS; i++) runs.push(await openOnce(page, rich.id));
    const warm = runs.slice(1);
    const nums = (k: keyof Run) =>
      warm.map((r) => r[k]).filter((v): v is number => typeof v === "number");
    await write({
      status: "ok",
      throttle: cdp ? 2 : "n/a",
      rows,
      cold: runs[0],
      warm: {
        visibleMsMedian: median(nums("visibleMs")),
        visibleMsMax: r1(Math.max(...nums("visibleMs"))),
        maxGapMsMedian: median(nums("maxGapMs")),
        slowFramesMedian: median(nums("slowFrames")),
        longFramesTotal: nums("longFrames").reduce((a, b) => a + b, 0),
        longTasksTotal:
          runs[0].longTasks === null
            ? null
            : nums("longTasks").reduce((a, b) => a + b, 0),
        longTaskMsTotal:
          runs[0].longTasks === null
            ? null
            : r1(nums("longTaskMs").reduce((a, b) => a + b, 0)),
        framesMedian: median(nums("frames")),
      },
      runs,
    });
  } catch (e) {
    await mkdir(OUT, { recursive: true });
    await page
      .screenshot({ path: path.join(OUT, `${project}__fail.png`) })
      .catch(() => undefined);
    await write({
      status: "unreachable",
      reason: (e as Error).message.split("\n")[0],
    });
  }
});
