// A running focus session for the probe user, so the phone's Focus button
// (left of the dock) can be shot in its three states. Direct database writes;
// the app gets no test-only route.
//   npx tsx .github/safari/seed-focus.ts running|paused|ending|none
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const state = process.argv[2] ?? "running";
  const email = process.env.PROBE_EMAIL ?? "ci-pro@needt.local";
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.focusSession.deleteMany({ where: { userId: user.id } });
  if (state === "none") return;
  const planned = 25;
  const now = Date.now();
  // running: 7 min in (18 left); paused: the same, paused now; ending: 105 s
  // left (the last 2 minutes), seeded right before its shot
  const inMin = state === "ending" ? 23.25 : 7;
  await prisma.focusSession.create({
    data: {
      userId: user.id,
      mode: "POMODORO",
      plannedMinutes: planned,
      startedAt: new Date(now - inMin * 60_000),
      pausedAt: state === "paused" ? new Date(now) : null,
      intention: "Deep work",
      source: "web",
    },
  });
  console.log(`focus session: ${state}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
