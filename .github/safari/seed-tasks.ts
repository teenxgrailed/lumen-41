// Rows for the scroll scenarios, created for the user that signed in through the
// normal sign-in form. Direct database writes; the app gets no test-only route.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.PROBE_EMAIL ?? "ci-pro@needt.local";
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const member = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
  });
  // The probe shoots light and dark from the simulator's appearance, so the app
  // follows the system; the one-time "New icons for Needt" sheet is marked seen
  // so it doesn't cover every screen.
  const existing = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  const prefs = { ...((existing?.prefs as Record<string, unknown>) ?? {}), seenIconPicker: true };
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: { theme: "system", prefs },
    create: { userId: user.id, theme: "system", prefs },
  });
  for (let i = 0; i < 30; i++)
    await prisma.task.create({
      data: {
        userId: user.id,
        workspaceId: member?.workspaceId,
        title: `Row ${i + 1}`,
        status: "todo",
        dueDate: new Date(),
      },
    });
  console.log(`seeded 30 tasks for ${email} in ${member?.workspaceId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
