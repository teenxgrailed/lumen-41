import { type Page, expect, test } from "@playwright/test";

import { prisma } from "@/lib/prisma";

import { disableAgentHub, enableAgentHub } from "../helpers/agent-hub";
import { VISUAL_TEST_EMAIL, VISUAL_TEST_NOW } from "./fixtures";
import { signInVisualUser } from "./helpers";

/*
 * Agents on the night ground (owner, 05.11.26): the Map and the working tabs,
 * light and dark app themes, desktop and phone. The hub is served from
 * fixtures so the shots do not move with the database, the Map is pinned to
 * one seed, and reduced motion makes it one still frame.
 */
const at = (minutesAgo: number) =>
  new Date(
    new Date(VISUAL_TEST_NOW).getTime() - minutesAgo * 60_000
  ).toISOString();

const agent = (
  id: string,
  name: string,
  seenMinutesAgo: number | null,
  held: number
) => ({
  id,
  name,
  kind: "other",
  skills: ["writing", "research"],
  connection: "MCP",
  openItems: held + 1,
  heldItems: held,
  lastSeenAt: seenMinutesAgo === null ? null : at(seenMinutesAgo),
  limits:
    held > 0
      ? {
          maxInProgress: 3,
          maxClaimsPerDay: null,
          inboxLimit: null,
          acceptsLarge: true,
        }
      : null,
  token: { preview: `nt_…${id}`, revoked: false, lastUsedAt: at(5) },
});

const item = (
  id: string,
  title: string,
  status: string,
  assignee: [string, string] | null,
  minutesAgo: number,
  extra: Record<string, unknown> = {}
) => ({
  id,
  title,
  status,
  goal: `${title}, ready for review.`,
  doneCriteria: "Reviewed",
  criteria: [
    { text: "Drafted", met: status === "done" || status === "in_progress" },
    { text: "Checked against the brief", met: status === "done" ? true : null },
    { text: "Approved", met: status === "done" ? true : null },
  ],
  risks: [],
  approvals: {},
  assignee: assignee ? { id: assignee[0], name: assignee[1] } : null,
  heldBy: status === "in_progress" && assignee ? { name: assignee[1] } : null,
  leaseExpiresAt: status === "in_progress" ? at(-60) : null,
  leaseExpired: false,
  question: null,
  noCapableAgent: false,
  ownerUnread: false,
  result: null,
  latestEvent: null,
  updatedAt: at(minutesAgo),
  ...extra,
});

const CLAUDE: [string, string] = ["a1", "Claude"];
const CODEX: [string, string] = ["a2", "Codex"];
const GROK: [string, string] = ["a3", "Grok"];

const OVERVIEW = {
  agents: [
    agent("a1", "Claude", 2, 1),
    agent("a2", "Codex", 6, 1),
    agent("a3", "Grok", 240, 0),
  ],
  items: [
    item("i1", "Week plan for the launch", "in_progress", CLAUDE, 4, {
      relations: [
        {
          kind: "blocks",
          direction: "out",
          item: { id: "i4", title: "Launch post", status: "open" },
        },
      ],
    }),
    item("i2", "Review the onboarding pull request", "in_progress", CODEX, 18),
    item("i3", "Pick a cover image", "needs_owner", GROK, 25, {
      question: "Which of the three covers?",
      ownerUnread: true,
    }),
    item("i4", "Launch post", "open", CLAUDE, 60),
    item("i5", "Collect competitor prices", "done", GROK, 90, {
      result: { summary: "Competitor prices collected" },
    }),
    item("i6", "Turn mail into tasks", "done", CLAUDE, 140, {
      result: { summary: "Three emails turned into tasks" },
    }),
    item("i7", "Release notes", "done", CODEX, 300, {
      result: { summary: "Release notes drafted" },
    }),
  ],
  notes: [
    {
      id: "n1",
      text: "The shop account signs in with the work address.",
      tags: ["accounts"],
      author: { kind: "agent", name: "Claude" },
      ownerEdited: false,
      updatedAt: at(120),
    },
    {
      id: "n2",
      text: "Screenshots for the store go in the shared drive, one folder per release.",
      tags: ["decisions"],
      author: { kind: "agent", name: "Codex" },
      ownerEdited: true,
      updatedAt: at(600),
    },
    {
      id: "n3",
      text: "Prices are compared in CHF, shipping included.",
      tags: ["facts"],
      author: { kind: "agent", name: "Grok" },
      ownerEdited: false,
      updatedAt: at(1500),
    },
  ],
  reservations: [],
};

const THREADS = {
  threads: [
    {
      id: "t1",
      subject: "Cover image options",
      itemId: "i3",
      lastMessageAt: at(25),
      ownerUnread: true,
      last: {
        from: "Grok",
        text: "Three covers are ready. Which one should I use?",
        importance: "normal",
      },
    },
    {
      id: "t2",
      subject: "Week plan",
      itemId: "i1",
      lastMessageAt: at(60),
      ownerUnread: false,
      last: {
        from: "Claude",
        text: "The plan is drafted from your calendar.",
        importance: "normal",
      },
    },
  ],
};

const THREAD = {
  thread: { subject: "Cover image options" },
  messages: [
    {
      id: "m1",
      from: { kind: "agent", name: "Grok" },
      body: "Three covers are ready. Which one should I use?",
      importance: "normal",
      ackRequired: false,
      createdAt: at(25),
    },
    {
      id: "m2",
      from: { kind: "owner" },
      body: "The second one.",
      importance: "normal",
      ackRequired: false,
      createdAt: at(20),
    },
  ],
};

const ACTIVITY = {
  windowDays: 7,
  nextCursor: null,
  events: [
    {
      id: "e1",
      at: at(4),
      kind: "claimed",
      type: "claimed",
      actor: { kind: "agent", id: "a1", name: "Claude" },
      item: { id: "i1", title: "Week plan for the launch" },
      message: "",
    },
    {
      id: "e2",
      at: at(25),
      kind: "escalated",
      type: "escalated",
      actor: { kind: "agent", id: "a3", name: "Grok" },
      item: { id: "i3", title: "Pick a cover image" },
      message: "Which of the three covers?",
    },
    {
      id: "e3",
      at: at(90),
      kind: "completed",
      type: "completed",
      actor: { kind: "agent", id: "a3", name: "Grok" },
      item: { id: "i5", title: "Collect competitor prices" },
      message: "Five shops",
    },
  ],
};

async function serveHub(page: Page) {
  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  await page.route("**/api/agent-hub/overview**", (r) =>
    r.fulfill(json(OVERVIEW))
  );
  await page.route("**/api/agent-hub/messages/**", (r) =>
    r.fulfill(json(THREAD))
  );
  await page.route("**/api/agent-hub/messages", (r) =>
    r.request().method() === "GET" ? r.fulfill(json(THREADS)) : r.continue()
  );
  await page.route("**/api/agent-hub/activity**", (r) =>
    r.fulfill(json(ACTIVITY))
  );
  await page.route("**/api/agent-hub/recurrences**", (r) =>
    r.fulfill(json({ recurrences: [] }))
  );
  await page.route("**/api/agent-hub/webhooks**", (r) =>
    r.fulfill(json({ webhooks: [] }))
  );
  // The sidebar's Agents item reads { enabled, unread }.
  await page.route("**/api/agent-hub/badge**", (r) =>
    r.fulfill(json({ enabled: true, unread: 1 }))
  );
  await page.route("**/api/accounts", (r) =>
    r.fulfill(
      json({
        accounts: [
          {
            id: "c1",
            provider: "GOOGLE",
            email: "qa@example.com",
            calendars: [],
          },
        ],
      })
    )
  );
  await page.route("**/api/mail/accounts", (r) =>
    r.fulfill(
      json({
        accounts: [{ id: "m1", provider: "gmail", email: "qa@example.com" }],
      })
    )
  );
  await page.route("**/api/integrations/catalog", (r) =>
    r.fulfill(json({ connections: [] }))
  );
}

async function prepare(
  page: Page,
  theme: "dark" | "light",
  { setup = false } = {}
) {
  await page.clock.setFixedTime(new Date(VISUAL_TEST_NOW));
  await page.addInitScript((showSetup) => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
    // The first-visit setup has its own shot; the tabs start past it.
    if (showSetup) localStorage.removeItem("needt:agents-onboarded");
    else localStorage.setItem("needt:agents-onboarded", "1");
  }, setup);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  const user = await prisma.user.findUnique({
    where: { email: VISUAL_TEST_EMAIL },
    select: { id: true },
  });
  expect(user).toBeTruthy();
  await enableAgentHub(user!.id);
  await signInVisualUser(page);
  await serveHub(page);
  const res = await page.request.patch("/api/user-settings", {
    data: { theme },
  });
  expect(res.ok()).toBeTruthy();
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

// The override is for this spec only: the specs after it share the visual
// user, and a live Agents item in their sidebar would move their baselines.
test.afterAll(async () => {
  const user = await prisma.user.findUnique({
    where: { email: VISUAL_TEST_EMAIL },
    select: { id: true },
  });
  if (user) await disableAgentHub(user.id);
});

const TABS = [
  ["map", "[data-ag-map] canvas"],
  ["agents", "[data-ag-card]"],
  ["tasks", "[data-ag-item]"],
  ["chat", "[data-ag-chat]"],
  ["activity", "[data-ag-event]"],
  ["memory", "[data-ag-note]"],
] as const;

for (const theme of ["dark", "light"] as const) {
  for (const [tab, ready] of TABS) {
    test(`Agents ${tab}, ${theme}`, async ({ page }) => {
      const width = page.viewportSize()?.width ?? 0;
      test.skip(width >= 768 && width < 1024, "Desktop and phone only.");
      const phone = width < 768;
      await prepare(page, theme);
      const query =
        tab === "map" ? "seed=7" : tab === "chat" ? "thread=t1" : `tab=${tab}`;
      await page.goto(`/agents?${query}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".ag-night")).toBeVisible({ timeout: 45_000 });
      await expect(page.locator(ready).first()).toBeVisible();
      // Chat is one column with no counts; every other tab shows them.
      if (tab !== "chat")
        await expect(page.locator("[data-ag-status]")).toHaveText(
          "3 agents · 7 tasks this week · 2 working now"
        );
      if (tab === "map") {
        await expect(page.locator("[data-ag-map-result]")).toHaveCount(
          phone ? 2 : 3
        );
      }
      await settle(page);
      await expect(page).toHaveScreenshot(
        `agents-${tab}-${phone ? "phone" : "desktop"}-${theme}.png`,
        { maxDiffPixelRatio: tab === "map" ? 0.02 : 0.01 }
      );
    });
  }
}

for (const theme of ["dark", "light"] as const) {
  test(`Agents setup, ${theme}`, async ({ page }) => {
    const width = page.viewportSize()?.width ?? 0;
    test.skip(width >= 768 && width < 1024, "Desktop and phone only.");
    const phone = width < 768;
    await prepare(page, theme, { setup: true });
    await page.goto("/agents?seed=7", { waitUntil: "domcontentloaded" });
    // The fixture has agents, so the setup opens from Replay setup (it opens
    // by itself only with none).
    await page.locator("[data-ag-replay-setup]").click({ timeout: 45_000 });
    await expect(page.locator("[data-ag-onboarding]")).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.locator("[data-ag-setup-agent]")).toHaveCount(8);
    await settle(page);
    await expect(page).toHaveScreenshot(
      `agents-setup-${phone ? "phone" : "desktop"}-${theme}.png`,
      { maxDiffPixelRatio: 0.01 }
    );
  });
}
