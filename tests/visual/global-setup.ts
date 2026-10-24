import { Prisma, WorkspaceKind, WorkspaceRole } from "@prisma/client";
import { hash } from "bcryptjs";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { prepareE2eEnvironment } from "../e2e/environment";
import {
  VISUAL_TEST_BOARD_COLUMNS,
  VISUAL_TEST_BOARD_ID,
  VISUAL_TEST_EMAIL,
  VISUAL_TEST_PAGE_ID,
  VISUAL_TEST_PASSWORD,
  VISUAL_TEST_TASK_IDS,
} from "./fixtures";

export async function resetVisualTaskData(userId: string, workspaceId: string) {
  await prisma.task.deleteMany({
    where: {
      OR: [{ userId }, { id: { in: [...VISUAL_TEST_TASK_IDS] } }],
    },
  });
  await prisma.task.createMany({
    data: [
      {
        id: "visual-task-plan",
        userId,
        workspaceId,
        title: "Plan the launch",
        description:
          "<!--needt-rich-text:v1--><p>Review the brief and choose the <strong>next action</strong>.</p>",
        status: "todo",
        duration: 30,
        estimatedMinutes: 30,
        startDate: new Date("2026-07-16T00:00:00+02:00"),
        dueDate: new Date("2026-07-16T08:30:00+02:00"),
        isAutoScheduled: false,
        boardId: VISUAL_TEST_BOARD_ID,
        boardColumnId: VISUAL_TEST_BOARD_COLUMNS.next,
        boardPosition: 0,
      },
      {
        id: "visual-task-morning",
        userId,
        workspaceId,
        title: "Morning deep work",
        description:
          '<!--needt-rich-text:v1--><h2>Focus block</h2><ul data-type="taskList"><li data-checked="false"><p>Draft the first section</p></li></ul>',
        status: "todo",
        duration: 60,
        estimatedMinutes: 60,
        scheduledStart: new Date("2026-07-16T09:00:00+02:00"),
        scheduledEnd: new Date("2026-07-16T10:00:00+02:00"),
        startDate: new Date("2026-07-16T00:00:00+02:00"),
        dueDate: new Date("2026-07-16T10:00:00+02:00"),
        isAutoScheduled: true,
        autoScheduled: true,
        boardId: VISUAL_TEST_BOARD_ID,
        boardColumnId: VISUAL_TEST_BOARD_COLUMNS.doing,
        boardPosition: 0,
      },
      {
        id: "visual-task-afternoon",
        userId,
        workspaceId,
        title: "Review calendar sync",
        description: "Check the latest provider status.",
        status: "todo",
        duration: 45,
        estimatedMinutes: 45,
        scheduledStart: new Date("2026-07-16T14:00:00+02:00"),
        scheduledEnd: new Date("2026-07-16T14:45:00+02:00"),
        startDate: new Date("2026-07-16T00:00:00+02:00"),
        dueDate: new Date("2026-07-16T14:45:00+02:00"),
        isAutoScheduled: true,
        autoScheduled: true,
        boardId: VISUAL_TEST_BOARD_ID,
        boardColumnId: VISUAL_TEST_BOARD_COLUMNS.next,
        boardPosition: 1,
      },
      {
        id: "visual-task-evening",
        userId,
        workspaceId,
        title: "Evening shutdown",
        status: "todo",
        duration: 20,
        estimatedMinutes: 20,
        scheduledStart: new Date("2026-07-16T18:30:00+02:00"),
        scheduledEnd: new Date("2026-07-16T18:50:00+02:00"),
        startDate: new Date("2026-07-16T00:00:00+02:00"),
        dueDate: new Date("2026-07-16T18:50:00+02:00"),
        isAutoScheduled: true,
        autoScheduled: true,
      },
    ],
  });
}

export async function resetVisualSettings(userId: string) {
  await Promise.all([
    prisma.userSettings.upsert({
      where: { userId },
      update: {
        theme: "dark",
        defaultView: "week",
        timeZone: "Europe/Zurich",
        weekStartDay: "monday",
        timeFormat: "12h",
      },
      create: {
        userId,
        theme: "dark",
        defaultView: "week",
        timeZone: "Europe/Zurich",
        weekStartDay: "monday",
        timeFormat: "12h",
      },
    }),
    prisma.calendarSettings.upsert({
      where: { userId },
      update: {
        workingHoursEnabled: true,
        workingHoursStart: "09:00",
        workingHoursEnd: "17:00",
        workingHoursDays: "[1,2,3,4,5]",
      },
      create: {
        userId,
        workingHoursEnabled: true,
        workingHoursStart: "09:00",
        workingHoursEnd: "17:00",
        workingHoursDays: "[1,2,3,4,5]",
      },
    }),
    prisma.userCustomization.upsert({
      where: { userId },
      update: {
        themePreset: "needt",
        animationsEnabled: false,
        sidebarWidth: 244,
      },
      create: {
        userId,
        themePreset: "needt",
        animationsEnabled: false,
        sidebarWidth: 244,
      },
    }),
  ]);
  // An established account: its zone is chosen, so the first-run locale
  // write (LocaleFirstRun) never fires mid-screenshot. Merged, not replaced,
  // so other prefs a spec relies on stay as they are.
  const row = await prisma.userSettings.findUnique({
    where: { userId },
    select: { prefs: true },
  });
  const prefs =
    row?.prefs && typeof row.prefs === "object" && !Array.isArray(row.prefs)
      ? (row.prefs as Record<string, unknown>)
      : {};
  if (prefs.tzAutoSet !== true)
    await prisma.userSettings.update({
      where: { userId },
      data: { prefs: { ...prefs, tzAutoSet: true } as Prisma.InputJsonObject },
    });
}

export default async function globalSetup() {
  await prepareE2eEnvironment();
  const passwordHash = await hash(VISUAL_TEST_PASSWORD, 8);
  // The app shell gates unverified accounts behind EmailVerificationGate,
  // which covers the surfaces these specs screenshot and swallows their
  // clicks. The gate is not what the visual suite is testing.
  const emailVerified = newDate();
  const user = await prisma.user.upsert({
    where: { email: VISUAL_TEST_EMAIL },
    update: {
      name: "Visual QA",
      role: "admin",
      emailVerified,
    },
    create: {
      email: VISUAL_TEST_EMAIL,
      name: "Visual QA",
      role: "admin",
      emailVerified,
    },
  });
  const workspace = await prisma.workspace.upsert({
    where: { personalOwnerId: user.id },
    update: { name: "Visual QA" },
    create: {
      name: "Visual QA",
      kind: WorkspaceKind.PERSONAL,
      personalOwnerId: user.id,
    },
  });
  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: { workspaceId: workspace.id, userId: user.id },
    },
    update: { role: WorkspaceRole.OWNER },
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: WorkspaceRole.OWNER,
    },
  });

  await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: "credentials",
        providerAccountId: VISUAL_TEST_EMAIL,
      },
    },
    update: {
      userId: user.id,
      id_token: passwordHash,
    },
    create: {
      userId: user.id,
      type: "credentials",
      provider: "credentials",
      providerAccountId: VISUAL_TEST_EMAIL,
      id_token: passwordHash,
    },
  });

  await Promise.all([
    resetVisualSettings(user.id),
    prisma.systemSettings.upsert({
      where: { id: "default" },
      update: { disableHomepage: false, publicSignup: false },
      create: {
        id: "default",
        disableHomepage: false,
        publicSignup: false,
        logDestination: "db",
        logLevel: "error",
      },
    }),
  ]);

  await prisma.focusSession.deleteMany({ where: { userId: user.id } });

  await prisma.page.upsert({
    where: { id: VISUAL_TEST_PAGE_ID },
    update: {
      userId: user.id,
      workspaceId: workspace.id,
      title: "Visual design notes",
      icon: "🎨",
      isPrivate: false,
      trashedAt: null,
      updatedAt: new Date("2026-07-16T10:00:00+02:00"),
    },
    create: {
      id: VISUAL_TEST_PAGE_ID,
      userId: user.id,
      workspaceId: workspace.id,
      title: "Visual design notes",
      icon: "🎨",
      isPrivate: false,
      createdAt: new Date("2026-07-16T09:00:00+02:00"),
      updatedAt: new Date("2026-07-16T10:00:00+02:00"),
    },
  });
  await prisma.pageBlock.upsert({
    where: { id: "visual-page-design-notes-body" },
    update: {
      pageId: VISUAL_TEST_PAGE_ID,
      content: {
        html: "<p>Create your first page to start writing.</p>",
      },
      position: 1024,
    },
    create: {
      id: "visual-page-design-notes-body",
      pageId: VISUAL_TEST_PAGE_ID,
      type: "PARAGRAPH",
      content: {
        html: "<p>Create your first page to start writing.</p>",
      },
      position: 1024,
    },
  });

  await prisma.board.upsert({
    where: { id: VISUAL_TEST_BOARD_ID },
    update: {
      userId: user.id,
      workspaceId: workspace.id,
      name: "Launch plan",
      icon: "🚀",
      position: 0,
    },
    create: {
      id: VISUAL_TEST_BOARD_ID,
      userId: user.id,
      workspaceId: workspace.id,
      name: "Launch plan",
      icon: "🚀",
      position: 0,
    },
  });
  await prisma.boardColumn.deleteMany({
    where: { boardId: VISUAL_TEST_BOARD_ID },
  });
  await prisma.boardColumn.createMany({
    data: [
      {
        id: VISUAL_TEST_BOARD_COLUMNS.next,
        boardId: VISUAL_TEST_BOARD_ID,
        name: "Next",
        color: "#60a5fa",
        position: 0,
      },
      {
        id: VISUAL_TEST_BOARD_COLUMNS.doing,
        boardId: VISUAL_TEST_BOARD_ID,
        name: "In progress",
        color: "#fbbf24",
        position: 1,
      },
      {
        id: VISUAL_TEST_BOARD_COLUMNS.done,
        boardId: VISUAL_TEST_BOARD_ID,
        name: "Done",
        color: "#34d399",
        position: 2,
      },
    ],
  });

  await resetVisualTaskData(user.id, workspace.id);

  const mailAccount = await prisma.mailAccount.upsert({
    where: {
      userId_provider_address: {
        userId: user.id,
        provider: "IMAP",
        address: "visual@needt.local",
      },
    },
    update: {
      status: "ACTIVE",
      lastSyncAt: new Date("2026-07-16T10:20:00+02:00"),
    },
    create: {
      userId: user.id,
      provider: "IMAP",
      address: "visual@needt.local",
      status: "ACTIVE",
      lastSyncAt: new Date("2026-07-16T10:20:00+02:00"),
    },
  });
  await prisma.mailMessage.deleteMany({ where: { accountId: mailAccount.id } });
  await prisma.mailMessage.createMany({
    data: [
      {
        accountId: mailAccount.id,
        externalId: "visual-mail-launch",
        fromName: "Maya Chen",
        fromAddress: "maya@example.com",
        toAddresses: ["visual@needt.local"],
        subject: "Launch review notes",
        snippet: "The timeline looks good. Two decisions are still open.",
        date: new Date("2026-07-16T09:42:00+02:00"),
        isRead: false,
        labels: ["inbox"],
        bodyHtml:
          "<p>Hi,</p><p>The timeline looks good. We only need to settle the launch copy and the final calendar check.</p><p>Thanks,<br>Maya</p>",
      },
      {
        accountId: mailAccount.id,
        externalId: "visual-mail-calendar",
        fromName: "Calendar operations",
        fromAddress: "ops@example.com",
        toAddresses: ["visual@needt.local"],
        subject: "Calendar sync is ready",
        snippet: "All provider checks passed this morning.",
        date: new Date("2026-07-16T08:15:00+02:00"),
        isRead: true,
        labels: ["inbox"],
        bodyHtml:
          "<p>All provider checks passed this morning. No action is needed.</p>",
      },
    ],
  });

  await prisma.aISettings.upsert({
    where: { userId: user.id },
    update: { provider: "NONE", encryptedApiKey: null },
    create: { userId: user.id, provider: "NONE" },
  });
  await prisma.aiConversation.deleteMany({ where: { userId: user.id } });
  await prisma.aiConversation.create({
    data: {
      id: "visual-ai-conversation",
      userId: user.id,
      workspaceId: workspace.id,
      title: "Today’s priorities",
      createdAt: new Date("2026-07-16T08:00:00+02:00"),
      updatedAt: new Date("2026-07-16T08:05:00+02:00"),
      messages: {
        create: [
          {
            id: "visual-ai-message-user",
            userId: user.id,
            workspaceId: workspace.id,
            role: "user",
            content: "What should I focus on first?",
            createdAt: new Date("2026-07-16T08:00:00+02:00"),
          },
          {
            id: "visual-ai-message-assistant",
            userId: user.id,
            workspaceId: workspace.id,
            role: "assistant",
            content:
              "Start with Morning deep work while your energy window is high, then review calendar sync after lunch.",
            createdAt: new Date("2026-07-16T08:01:00+02:00"),
          },
        ],
      },
    },
  });
}
