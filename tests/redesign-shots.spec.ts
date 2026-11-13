/* Before/after screenshots for the redesign port (feat/redesign-remaining).
   Not part of the regular suite: it runs only with REDESIGN_SHOTS_PHASE set
   ("before" or "after") and writes PNGs into docs/redesign-shots/. Seeds a
   booking page and a shared moodboard on the local database it runs against. */
import { encode } from "next-auth/jwt";

import { moodboardLinkToken } from "@/services/moodboards/moodboard-service";
import { type Page, expect, test } from "@playwright/test";
import path from "node:path";

import { prisma } from "@/lib/prisma";

const PHASE = process.env.REDESIGN_SHOTS_PHASE;
const DIR = path.resolve("docs/redesign-shots");
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

test.skip(!PHASE, "set REDESIGN_SHOTS_PHASE=before|after to take shots");
test.describe.configure({ mode: "serial" });

const OWNER = "ci-pro@needt.local";
const ADMIN = "ci-lifetime@needt.local";
const SLUG = "redesign-shots";

let boardPath = "";

async function signIn(page: Page, email: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: { id: true, role: true },
  });
  const token = await encode({
    secret: process.env.NEXTAUTH_SECRET!,
    maxAge: 60 * 60,
    token: { sub: user.id, email, role: user.role },
  });
  await page.context().addCookies([
    {
      name: "next-auth.session-token",
      value: token,
      url: BASE,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function shoot(page: Page, name: string, url: string, ready?: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  if (ready) await page.waitForSelector(ready, { timeout: 120_000 });
  await page.waitForTimeout(3000);
  await page.screenshot({
    // A full-page capture comes out blank on the app's fixed-height roots.
    path: path.join(DIR, `${name}.${PHASE}.png`),
  });
}

test.beforeAll(async () => {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: OWNER },
    select: { id: true },
  });
  const week = Object.fromEntries(
    ["1", "2", "3", "4", "5"].map((d) => [
      d,
      [{ start: "09:00", end: "17:00" }],
    ])
  );
  await prisma.bookingPage.upsert({
    where: { slug: SLUG },
    update: {},
    create: {
      userId: owner.id,
      slug: SLUG,
      title: "Intro call",
      description: "A short call to see whether we are a fit.",
      durationMinutes: 30,
      minimumNotice: 0,
      timeZone: "Europe/Zurich",
      availability: week,
    },
  });

  let member = await prisma.workspaceMember.findFirst({
    where: { userId: owner.id },
    select: { workspaceId: true },
  });
  if (!member) {
    const ws = await prisma.workspace.create({
      data: { name: "Personal", personalOwnerId: owner.id },
    });
    await prisma.workspaceMember.create({
      data: { workspaceId: ws.id, userId: owner.id, role: "OWNER" },
    });
    member = { workspaceId: ws.id };
  }
  let board = await prisma.moodboard.findFirst({
    where: { title: "Redesign shots", workspaceId: member.workspaceId },
  });
  if (!board) {
    board = await prisma.moodboard.create({
      data: {
        workspaceId: member.workspaceId,
        createdById: owner.id,
        title: "Redesign shots",
        linkShare: true,
        items: {
          create: [
            { kind: "color", color: "#c9b79c", colorName: "Sand", position: 0 },
            { kind: "text", text: "Raw, underground, quiet.", position: 1 },
            { kind: "color", color: "#2b2d31", colorName: "Ink", position: 2 },
            {
              kind: "link",
              url: "https://example.com/lookbook",
              title: "Lookbook",
              position: 3,
            },
          ],
        },
      },
    });
  }
  boardPath = `/b/${board.id}/${moodboardLinkToken(board.id, board.linkTokenVersion)}`;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

const PUBLIC: Array<[string, () => string]> = [
  ["book-slug", () => `/book/${SLUG}`],
  ["book-cancel", () => "/book/cancel/not-a-real-token"],
  ["moodboard-public", () => boardPath],
  ["privacy", () => "/privacy"],
  ["terms", () => "/terms"],
  ["not-found", () => "/book/no-such-page"],
];

for (const [name, url] of PUBLIC) {
  test(`public: ${name}`, async ({ page }) => {
    await shoot(page, name, url());
    expect(true).toBe(true);
  });
}

test("signed in: share", async ({ page }) => {
  await signIn(page, OWNER);
  await shoot(
    page,
    "share",
    "/share?title=Lookbook&url=https%3A%2F%2Fexample.com",
    "[data-share-sheet]"
  );
});

// The local stack has no worker or Redis queues, so the snapshot is a fixture:
// the screenshot shows the layout, not live numbers.
const OPERATIONS = {
  services: [
    { service: "Postgres", configured: true, healthy: true },
    {
      service: "Redis",
      configured: true,
      healthy: false,
      detail: "Connection refused",
    },
    { service: "Sentry", configured: false, detail: "SENTRY_DSN is empty" },
  ],
  queues: [
    {
      name: "calendar-sync",
      waiting: 3,
      active: 1,
      failed: 0,
      oldestWaitingAgeMs: 4000,
    },
    {
      name: "reminders",
      waiting: 140,
      active: 0,
      failed: 2,
      oldestWaitingAgeMs: 180000,
    },
  ],
  cronStates: [
    {
      id: "rescheduler",
      lastStartedAt: null,
      lastSucceededAt: "2026-11-12T20:00:00Z",
      lastError: null,
    },
    {
      id: "webhook-renewal",
      lastStartedAt: null,
      lastSucceededAt: null,
      lastError: null,
    },
  ],
  lastSuccessfulBySource: [],
  lastError: null,
};

test("signed in: oauth-authorize", async ({ page }) => {
  await signIn(page, OWNER);
  await shoot(
    page,
    "oauth-authorize",
    "/oauth/authorize?client_id=unknown-client",
    "main"
  );
});

test("admin: operations", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.route("**/api/admin/operations", (route) =>
    route.fulfill({ json: OPERATIONS })
  );
  await shoot(page, "admin-operations", "/admin/operations");
});
