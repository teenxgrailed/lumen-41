// Data for the App Store screenshots (.github/workflows/store-screenshots.yml),
// written straight into the throwaway CI database for the account CI signs in
// with. The planner is the one the App Review demo account gets
// (seedSandboxContent: 8 tasks in 2 projects, 3 events this week, 2 documents,
// 2 habits, a goal), so the store shows what the reviewer will see.
//
//   npx tsx .github/store-screenshots/seed.ts all      planner + ids file
//   npx tsx .github/store-screenshots/seed.ts focus    a running focus session
//   npx tsx .github/store-screenshots/seed.ts nofocus  remove it again
import fs from "node:fs";

import { PrismaClient } from "@prisma/client";

import { seedSandboxContent } from "../../src/services/sandbox/sandbox-service";

const prisma = new PrismaClient();

async function main() {
  const mode = process.argv[2] ?? "all";
  const email = process.env.PROBE_EMAIL ?? "ci-pro@needt.local";
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });

  if (mode === "nofocus" || mode === "focus") {
    await prisma.focusSession.deleteMany({ where: { userId: user.id } });
    if (mode === "nofocus") return;
    await prisma.focusSession.create({
      data: {
        userId: user.id,
        mode: "POMODORO",
        plannedMinutes: 25,
        startedAt: new Date(Date.now() - 7 * 60_000),
        intention: "Draft the launch announcement",
        source: "web",
      },
    });
    console.log("focus session running, 7 of 25 minutes in");
    return;
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
  });
  // Created by the first signed-in request; rows without it are invisible.
  if (!member) throw new Error(`${email} has no workspace yet; sign in first`);
  const workspaceId = member.workspaceId;

  // Follow the device's appearance (the workflow sets light); the one-time
  // icon sheet would cover every screen. seedSandboxContent reads the zone.
  const existing = await prisma.userSettings.findUnique({
    where: { userId: user.id },
  });
  const prefs = {
    ...((existing?.prefs as Record<string, unknown>) ?? {}),
    seenIconPicker: true,
  };
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: { theme: "system", timeZone: "Europe/Zurich", prefs },
    create: {
      userId: user.id,
      theme: "system",
      timeZone: "Europe/Zurich",
      prefs,
    },
  });

  const counts = await prisma.$transaction(
    (tx) => seedSandboxContent(tx, { userId: user.id, workspaceId, now: new Date() }),
    { timeout: 120_000 }
  );

  const page = await prisma.page.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true },
  });
  const ids = { pageId: page?.id ?? null, pageTitle: page?.title ?? null };
  fs.writeFileSync(
    process.env.STORE_IDS_FILE ?? "store-ids.json",
    JSON.stringify(ids)
  );
  console.log("seeded", counts, ids, "for", email, "in", workspaceId);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // The service module pulls in singletons that keep the event loop alive.
    process.exit(process.exitCode ?? 0);
  });
