// Data for the real-WKWebView screenshots (.github/workflows/macos-webview.yml),
// written straight into the throwaway CI database for the account CI signs in
// with: 30 tasks so the Home pane scrolls, one overdue task with its "Task
// overdue" nudge (what the worker would create, so the corner has a
// notification to show), a project and a calendar connection.
import { PrismaClient, ProactiveNudgeType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.PROBE_EMAIL ?? "ci-pro@needt.local";
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const member = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
  });
  // Created by the first signed-in request; rows without it are invisible.
  if (!member) throw new Error(`${email} has no workspace yet; sign in first`);
  const workspaceId = member.workspaceId;

  // The app follows the system appearance (the workflow switches macOS
  // between light and dark); the one-time icon sheet would cover every shot.
  const existing = await prisma.userSettings.findUnique({
    where: { userId: user.id },
  });
  const prefs = {
    ...((existing?.prefs as Record<string, unknown>) ?? {}),
    seenIconPicker: true,
  };
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: { theme: "system", prefs },
    create: {
      userId: user.id,
      theme: "system",
      timeZone: "Europe/Zurich",
      prefs,
    },
  });

  const project = await prisma.project.create({
    data: { userId: user.id, workspaceId, name: "Launch", color: "#7c5cff" },
  });

  const now = new Date();
  for (let i = 0; i < 30; i++) {
    await prisma.task.create({
      data: {
        userId: user.id,
        workspaceId,
        projectId: i % 3 === 0 ? project.id : null,
        title: `Row ${i + 1}`,
        status: "todo",
        dueDate: now,
      },
    });
  }

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const overdue = await prisma.task.create({
    data: {
      userId: user.id,
      workspaceId,
      projectId: project.id,
      title: "Send the launch brief",
      status: "todo",
      dueDate: yesterday,
    },
  });
  const day = now.toISOString().slice(0, 10);
  await prisma.proactiveNudge.create({
    data: {
      userId: user.id,
      taskId: overdue.id,
      type: ProactiveNudgeType.OVERDUE_TASK,
      timeWindow: day,
      dedupeKey: `${overdue.id}:${ProactiveNudgeType.OVERDUE_TASK}:${day}`,
      title: "Task overdue",
      body: overdue.title,
      deepLink: `/today?task=${overdue.id}`,
    },
  });

  // A connected Google calendar. The tokens are placeholders: nothing syncs
  // on the runner (no worker), the Connections screen only lists it.
  const account = await prisma.connectedAccount.create({
    data: {
      userId: user.id,
      provider: "GOOGLE",
      email: "ci-calendar@needt.local",
      accessToken: "ci-placeholder",
      refreshToken: "ci-placeholder",
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.calendarFeed.create({
    data: {
      userId: user.id,
      accountId: account.id,
      name: "Work",
      type: "GOOGLE",
      url: "ci-calendar@needt.local",
      color: "#3b82f6",
      enabled: true,
      lastSync: now,
    },
  });

  console.log(
    `seeded 31 tasks, 1 overdue nudge, project ${project.id}, connection ${account.id} for ${email} in ${workspaceId}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
