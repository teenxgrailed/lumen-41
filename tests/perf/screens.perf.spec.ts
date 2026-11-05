import { type CDPSession, type Page, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";

import { enableAgentHub, seedAgentHub } from "../helpers/agent-hub";
import { type V3User, createV3User, signInAs } from "../helpers/v3-user";

/*
 * Per screen and project: a screenshot at rest, 3 s idle, and one scripted
 * interaction (scroll the main list, or open and close a panel). Chromium
 * records CDP Performance.getMetrics deltas, rAF frame p50/p95 and long tasks;
 * WebKit has no CDP, so it records rAF frames and long tasks (where the engine
 * supports them) and the CDP fields are null ("n/a" in the table).
 * One JSON per (project, screen) lands in perf/json, shots in perf/shots.
 * A screen that cannot be reached is recorded as `unreachable` with the
 * reason, never as a failure, so one broken selector does not hide the rest.
 */
const OUT = "perf";
const IDLE_MS = 3000;
const SEED_TASKS = 60;
const SEED_DOCS = 25;

type Metrics = {
  scriptMs: number | null;
  layoutMs: number | null;
  recalcStyleMs: number | null;
  layoutCount: number | null;
  frames: number;
  frameP50Ms: number | null;
  frameP95Ms: number | null;
  longTasks: number | null;
  longTaskMs: number | null;
};

type Screen = {
  id: string;
  path: string;
  signedIn: boolean;
  ready: (page: Page) => Promise<void>;
  /** Scripted interaction; throws when the screen cannot be driven. */
  interact: (page: Page, ctx: { phone: boolean }) => Promise<void>;
  only?: "phone" | "desktop";
  /** Extra data or flags for this screen, after the shared seed. */
  setup?: (user: V3User) => Promise<void>;
  /** Show the Agents first-visit setup instead of skipping it. */
  withAgentsSetup?: boolean;
};

const hubSetup = async (user: V3User) => {
  await enableAgentHub(user.id);
  await seedAgentHub(user.id, user.workspaceId);
};

const agentsReady = async (p: Page) => {
  await shellReady(p);
  await p.locator("[data-ag-map] canvas").waitFor({ timeout: 45_000 });
};

const sleep = (page: Page, ms: number) => page.waitForTimeout(ms);

const shellReady = async (p: Page) => {
  await p.locator(".needt-v3").waitFor({ timeout: 45_000 });
  if (p.url().includes("/auth/"))
    throw new Error("redirected to sign-in: the session was not accepted");
};

async function scrollMain(page: Page) {
  // The scroller differs between layouts: take the tallest scrollable element
  // and fall back to the window.
  const max = await page.evaluate(async () => {
    const el =
      Array.from(document.querySelectorAll<HTMLElement>("*"))
        .filter((e) => {
          const s = getComputedStyle(e);
          return (
            /(auto|scroll)/.test(s.overflowY) &&
            e.scrollHeight > e.clientHeight + 40
          );
        })
        .sort((a, b) => b.scrollHeight - a.scrollHeight)[0] ?? null;
    const to = (y: number) => (el ? (el.scrollTop = y) : window.scrollTo(0, y));
    const room = el
      ? el.scrollHeight - el.clientHeight
      : document.documentElement.scrollHeight - window.innerHeight;
    const span = Math.min(room, 2400);
    const frame = () => new Promise((r) => setTimeout(r, 16));
    for (let i = 1; i <= 40; i++) {
      to((span * i) / 40);
      await frame();
    }
    for (let i = 39; i >= 0; i--) {
      to((span * i) / 40);
      await frame();
    }
    return room;
  });
  if (max >= 40) return;
  // No element scrolls by script: try a real wheel (desktop only).
  if (!page.viewportSize() || page.viewportSize()!.width < 800)
    throw new Error("nothing scrollable on this screen");
  await page.mouse.move(720, 450);
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 80);
    await sleep(page, 16);
  }
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, -80);
    await sleep(page, 16);
  }
}

/* What is on the page when a screen could not be driven. */
async function diagnose(page: Page) {
  return page
    .evaluate(() => ({
      url: location.pathname,
      ui: document.querySelector(".needt-v3")?.getAttribute("data-ui") ?? null,
      docHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      overflowY: Array.from(document.querySelectorAll<HTMLElement>("*"))
        .filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY))
        .slice(0, 12)
        .map(
          (e) =>
            `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 40)} ${e.scrollHeight}/${e.clientHeight}`
        ),
      buttons: Array.from(document.querySelectorAll("button,[role=button],a"))
        .map((e) => e.getAttribute("aria-label") || e.textContent?.trim() || "")
        .filter(Boolean)
        .slice(0, 40),
      inputs: Array.from(document.querySelectorAll("input")).map(
        (e) => e.getAttribute("placeholder") || e.type
      ),
      text: document.body.innerText.replace(/\s+/g, " ").slice(0, 300),
    }))
    .catch((e) => ({ error: String(e) }));
}

async function everyPlace(p: Page) {
  await p
    .getByRole("button", { name: /^Every place/ })
    .tap({ timeout: 10_000 });
}

const screens: Screen[] = [
  {
    id: "home-today",
    path: "/today",
    signedIn: true,
    ready: shellReady,
    interact: (p) => scrollMain(p),
  },
  {
    id: "calendar-week",
    path: "/calendar",
    signedIn: true,
    ready: shellReady,
    interact: (p) => scrollMain(p),
  },
  {
    id: "tasks",
    path: "/tasks",
    signedIn: true,
    ready: shellReady,
    interact: (p) => scrollMain(p),
  },
  {
    id: "docs",
    path: "/pages",
    signedIn: true,
    ready: shellReady,
    interact: (p) => scrollMain(p),
  },
  {
    id: "phone-every-place",
    path: "/today",
    signedIn: true,
    only: "phone",
    ready: async (p) => {
      await p
        .locator('.needt-v3[data-ui="phone"]')
        .waitFor({ timeout: 45_000 });
    },
    interact: async (p) => {
      for (let i = 0; i < 3; i++) {
        await everyPlace(p);
        await sleep(p, 900);
        await p.keyboard.press("Escape");
        await sleep(p, 900);
      }
    },
  },
  {
    id: "ask-panel",
    path: "/today",
    signedIn: true,
    ready: shellReady,
    interact: async (p, { phone }) => {
      // The phone's Ask is a sheet that Escape does not dismiss, so it is
      // opened once per run (the cold open is the cost people feel).
      for (let i = 0; i < (phone ? 1 : 3); i++) {
        if (phone) {
          await everyPlace(p);
          await sleep(p, 700);
          // The row sits in the menu's own scroller, behind its fog: a tap
          // cannot always reach it, a click event on it opens the same sheet.
          await p
            .locator('[data-nva-row="ask"], [data-nva-tile="ask"]')
            .first()
            .dispatchEvent("click", undefined, { timeout: 10_000 });
          await sleep(p, 2000);
        } else {
          await p.keyboard.press("Control+KeyJ");
          await p
            .locator("[data-chat-panel]")
            .waitFor({ state: "visible", timeout: 10_000 });
          await sleep(p, 900);
          await p.keyboard.press("Control+KeyJ");
        }
        await sleep(p, 900);
      }
    },
  },
  {
    // The Agents Map at rest is the idle number; the interaction sweeps the
    // pointer across it (hover, parallax) on the desktop and scrolls the
    // page on a phone.
    id: "agents-map",
    path: "/agents?seed=7",
    signedIn: true,
    setup: hubSetup,
    ready: agentsReady,
    interact: async (p, { phone }) => {
      if (phone) return scrollMain(p);
      const box = await p.locator("[data-ag-map]").boundingBox();
      if (!box) throw new Error("no map panel");
      for (let i = 0; i <= 60; i++) {
        await p.mouse.move(
          box.x + (box.width * i) / 60,
          box.y + box.height * (0.3 + 0.4 * Math.sin(i / 6))
        );
        await sleep(p, 16);
      }
    },
  },
  {
    // The first-visit setup: the arc, then picking two agents.
    id: "agents-setup",
    path: "/agents",
    signedIn: true,
    setup: hubSetup,
    withAgentsSetup: true,
    ready: async (p) => {
      await shellReady(p);
      await p.locator("[data-ag-onboarding]").waitFor({ timeout: 45_000 });
    },
    interact: async (p) => {
      for (const id of ["cursor", "gemini", "cursor", "gemini"]) {
        await p
          .locator(`[data-ag-setup-agent="${id}"]`)
          .click({ timeout: 10_000 });
        await sleep(p, 400);
      }
    },
  },
  {
    // Every tab of Agents, twice round.
    id: "agents-tabs",
    path: "/agents?seed=7",
    signedIn: true,
    setup: hubSetup,
    ready: agentsReady,
    interact: async (p) => {
      for (let round = 0; round < 2; round++) {
        for (const tab of [
          "agents",
          "tasks",
          "chat",
          "activity",
          "memory",
          "map",
        ]) {
          await p.locator(`[data-ag-tab="${tab}"]`).click({ timeout: 10_000 });
          await sleep(p, 400);
        }
      }
    },
  },
  {
    id: "sign-in",
    path: "/auth/signin",
    signedIn: false,
    ready: async (p) => {
      await p.locator("input").first().waitFor({ timeout: 45_000 });
    },
    interact: async (p) => {
      // No list to scroll: type into the address field and clear it.
      const email = p.locator("input").first();
      await email.click();
      await email.pressSequentially("someone@example.com", { delay: 40 });
      await email.fill("");
    },
  },
];

/* Recorder installed before the page's own scripts run. */
const RECORDER = () => {
  const frames: number[] = [];
  const longs: number[] = [];
  let last = 0;
  let on = false;
  let supported = true;
  try {
    const po = new PerformanceObserver((l) => {
      if (on) for (const e of l.getEntries()) longs.push(e.duration);
    });
    po.observe({ entryTypes: ["longtask"] });
  } catch {
    supported = false;
  }
  const tick = (t: number) => {
    if (on) {
      if (last) frames.push(t - last);
      last = t;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  (window as unknown as { __perf: unknown }).__perf = {
    start() {
      frames.length = 0;
      longs.length = 0;
      last = 0;
      on = true;
    },
    stop() {
      on = false;
      return { frames: frames.slice(), longs: longs.slice(), supported };
    },
  };
};

type PerfApi = {
  start(): void;
  stop(): { frames: number[]; longs: number[]; supported: boolean };
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return r1(s[Math.min(s.length - 1, Math.floor(p * s.length))]);
};

async function cdpSnapshot(cdp: CDPSession) {
  const { metrics } = (await cdp.send("Performance.getMetrics")) as {
    metrics: { name: string; value: number }[];
  };
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  return {
    script: m.ScriptDuration ?? 0,
    layout: m.LayoutDuration ?? 0,
    recalc: m.RecalcStyleDuration ?? 0,
    layoutCount: m.LayoutCount ?? 0,
  };
}

async function measure(
  page: Page,
  cdp: CDPSession | null,
  action: () => Promise<void>
): Promise<Metrics> {
  const before = cdp ? await cdpSnapshot(cdp) : null;
  await page.evaluate(() =>
    (window as unknown as { __perf: PerfApi }).__perf.start()
  );
  let failure: unknown = null;
  try {
    await action();
  } catch (e) {
    failure = e;
  }
  const rec = await page.evaluate(() =>
    (window as unknown as { __perf: PerfApi }).__perf.stop()
  );
  if (failure) throw failure;
  const after = cdp ? await cdpSnapshot(cdp) : null;
  const ms = (a: number | undefined, b: number | undefined) =>
    a === undefined || b === undefined ? null : r1((a - b) * 1000);
  return {
    scriptMs: ms(after?.script, before?.script),
    layoutMs: ms(after?.layout, before?.layout),
    recalcStyleMs: ms(after?.recalc, before?.recalc),
    layoutCount:
      after && before ? after.layoutCount - before.layoutCount : null,
    frames: rec.frames.length,
    frameP50Ms: pct(rec.frames, 0.5),
    frameP95Ms: pct(rec.frames, 0.95),
    longTasks: rec.supported ? rec.longs.length : null,
    longTaskMs: rec.supported ? r1(rec.longs.reduce((a, b) => a + b, 0)) : null,
  };
}

/*
 * Chrome trace through CDP Tracing. The invalidation-tracking category is what
 * names the attribute, class or pseudo that dirtied which node; SelectorStats
 * (when the Chrome build supports it) ranks selectors by match attempts.
 */
async function startTrace(cdp: CDPSession) {
  const events: unknown[] = [];
  cdp.on("Tracing.dataCollected", (d: { value: unknown[] }) => {
    events.push(...d.value);
  });
  const done = new Promise<void>((resolve) =>
    cdp.on("Tracing.tracingComplete", () => resolve())
  );
  await cdp.send("Tracing.start", {
    transferMode: "ReportEvents",
    traceConfig: {
      recordMode: "recordAsMuchAsPossible",
      // lite: the timeline alone, so UpdateLayoutTree durations are close to
      // real ones (the tracking categories inflate them by roughly 10x).
      includedCategories:
        process.env.PERF_TRACE === "lite"
          ? ["devtools.timeline"]
          : [
              "devtools.timeline",
              "disabled-by-default-devtools.timeline",
              "disabled-by-default-devtools.timeline.invalidationTracking",
              "disabled-by-default-blink.debug",
            ],
      enableSampling: false,
    },
  });
  return {
    async stop(file: string) {
      await cdp.send("Tracing.end");
      await done;
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify({ traceEvents: events }));
    },
  };
}

async function seedData(user: V3User) {
  const now = new Date();
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  await prisma.task.createMany({
    data: Array.from({ length: SEED_TASKS }, (_, i) => {
      const start = new Date(day.getTime() + (8 + (i % 9)) * 3600_000);
      start.setUTCDate(start.getUTCDate() + (i % 6) - 1);
      const scheduled = i % 3 !== 0;
      return {
        userId: user.id,
        workspaceId: user.workspaceId,
        title: `Perf seed task ${i + 1}`,
        description:
          i % 4 === 0 ? "Seeded for the performance baseline." : null,
        status: "todo",
        duration: 30 + (i % 4) * 15,
        estimatedMinutes: 30 + (i % 4) * 15,
        startDate: day,
        dueDate: new Date(start.getTime() + 3600_000),
        ...(scheduled
          ? {
              scheduledStart: start,
              scheduledEnd: new Date(start.getTime() + 45 * 60_000),
              isAutoScheduled: true,
              autoScheduled: true,
            }
          : {}),
      };
    }),
  });
  await prisma.page.createMany({
    data: Array.from({ length: SEED_DOCS }, (_, i) => ({
      userId: user.id,
      workspaceId: user.workspaceId,
      title: `Perf seed doc ${i + 1}`,
      icon: "📄",
      isPrivate: false,
    })),
  });
}

for (const screen of screens) {
  test(`perf: ${screen.id}`, async ({
    context,
    page,
    browserName,
  }, testInfo) => {
    const project = testInfo.project.name;
    const phone = project.startsWith("iphone");
    const base = { project, screen: screen.id, browser: browserName };
    const write = async (data: Record<string, unknown>) => {
      await mkdir(path.join(OUT, "json"), { recursive: true });
      await writeFile(
        path.join(OUT, "json", `${project}__${screen.id}.json`),
        JSON.stringify({ ...base, ...data }, null, 2)
      );
    };
    if (screen.only && (screen.only === "phone") !== phone) {
      await write({ status: "n/a", reason: `${screen.only} only` });
      test.skip(true, `${screen.only} only`);
      return;
    }

    try {
      await context.addInitScript(RECORDER);
      // The Agents setup opens once per device; perf measures the screens
      // behind it (the setup would cover the tab bar).
      if (!screen.withAgentsSetup)
        await context.addInitScript(() => {
          try {
            localStorage.setItem("needt:agents-onboarded", "1");
          } catch {
            // storage off: nothing to skip
          }
        });
      if (screen.signedIn) {
        const user = await createV3User(`perf-${screen.id}`);
        await seedData(user);
        await screen.setup?.(user);
        await signInAs(page, user);
      }
      await context.addCookies([
        {
          name: "needt-ui",
          value: phone ? "phone" : "desktop",
          url: process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000",
        },
      ]);

      const cdp =
        browserName === "chromium" ? await context.newCDPSession(page) : null;
      const rate = phone ? 4 : 2;
      if (cdp) {
        await cdp.send("Performance.enable");
        await cdp.send("Emulation.setCPUThrottlingRate", { rate });
      }

      await page.goto(screen.path, { waitUntil: "load" });
      await screen.ready(page);
      await sleep(page, 2500); // first-paint idle work (prefetch, prewarm)
      await mkdir(path.join(OUT, "shots"), { recursive: true });
      const shot = path.join("shots", `${project}__${screen.id}.png`);
      await page.screenshot({ path: path.join(OUT, shot) });

      const idle = await measure(page, cdp, () => sleep(page, IDLE_MS));
      let interaction: Metrics | null = null;
      let reason: string | null = null;
      // Opt-in trace (PERF_TRACE=1): only the Every place interaction, only
      // on iPhone 13 Chromium. The trace JSON lands in perf/trace.
      const tracing =
        ["1", "lite"].includes(process.env.PERF_TRACE ?? "") &&
        cdp !== null &&
        phone &&
        screen.id === "phone-every-place";
      const trace = tracing && cdp ? await startTrace(cdp) : null;
      try {
        interaction = await measure(page, cdp, () =>
          screen.interact(page, { phone })
        );
      } catch (e) {
        reason = (e as Error).message.split("\n")[0];
      }
      if (trace)
        await trace.stop(
          path.join(OUT, "trace", `${project}__${screen.id}.json`)
        );
      await write({
        status: interaction ? "ok" : "interaction-unreachable",
        reason,
        diag: interaction ? undefined : await diagnose(page),
        throttle: cdp ? rate : "n/a",
        screenshot: shot,
        idle,
        interaction,
      });
    } catch (e) {
      await mkdir(path.join(OUT, "shots"), { recursive: true });
      await page
        .screenshot({
          path: path.join(OUT, "shots", `${project}__${screen.id}__fail.png`),
        })
        .catch(() => undefined);
      await write({
        status: "unreachable",
        reason: (e as Error).message.split("\n")[0],
        diag: await diagnose(page),
      });
    }
  });
}
