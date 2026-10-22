import { listMemoriesForExport } from "@/services/ai/memory";
import { DataExportStatus } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";

import { APP_NAME } from "@/lib/app-config";
import { addHours, newDate } from "@/lib/date-utils";
import { EmailService } from "@/lib/email/email-service";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "AccountExport";
const EXPORT_TTL_HOURS = 24;

export function hashAccountExportToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function publicAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

function accountMetadataSelect() {
  return {
    id: true,
    provider: true,
    providerAccountId: true,
    type: true,
  } as const;
}

/**
 * Build an ownership-anchored export. Shared workspace membership never widens
 * the query to other members' private rows, and credentials/tokens are omitted.
 */
export async function collectAccountExport(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      role: true,
      isActive: true,
      accounts: { select: accountMetadataSelect() },
      workspaceMemberships: {
        select: {
          role: true,
          createdAt: true,
          updatedAt: true,
          workspace: {
            select: {
              id: true,
              name: true,
              kind: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      },
      autoScheduleSettings: true,
      userSettings: true,
      calendarSettings: true,
      notificationSettings: true,
      customizationSettings: true,
      integrationSettings: true,
      dataSettings: true,
      schedulingPreferences: true,
      focusPreferences: true,
      focusStats: true,
      blockingProfiles: true,
      aiUsage: true,
      aiSettings: {
        select: {
          id: true,
          provider: true,
          model: true,
          customUrl: true,
          soulPreset: true,
          allowParseTasks: true,
          allowReorder: true,
          allowSuggestEnergy: true,
          allowFullAuto: true,
          requestTimeoutSeconds: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      connectorSettings: {
        select: {
          webhookSchedule: true,
          webhookTaskComplete: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      subscription: {
        select: {
          plan: true,
          status: true,
          interval: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          amount: true,
          discountApplied: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });
  if (!user) throw new Error("ACCOUNT_NOT_FOUND");

  const [
    connectedAccounts,
    calendars,
    mailAccounts,
    mailFocusedSplits,
    projects,
    tasks,
    taskAssignments,
    tags,
    dailyAgendas,
    habits,
    weeklyFocusTargets,
    timeEntries,
    scheduledBlocks,
    focusSessions,
    schedulingRuns,
    taskDependencies,
    taskReminders,
    proactiveNudges,
    bookingPages,
    boards,
    savedViews,
    pages,
    pageAssets,
    pageAccessReceived,
    pageAccessGranted,
    pagePublications,
    pageFolders,
    pageTags,
    pageSmartFolders,
    pageTemplates,
    pageComments,
    pageFormSubmissions,
    pageRevisions,
    moodboards,
    moodboardAccessReceived,
    moodboardAccessGranted,
    projectTemplates,
    projectBlockers,
    projectHealthUpdates,
    taskActivities,
    meetingNoteProposals,
    aiPageProposals,
    aiConversations,
    agentMemories,
    externalIntegrations,
    workSchedules,
    energyProfileWindows,
    flexibleHoursOverrides,
    bugReports,
    taskProviders,
    taskChanges,
  ] = await Promise.all([
    prisma.connectedAccount.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        email: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.calendarFeed.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        type: true,
        color: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
        lastSync: true,
        events: true,
      },
    }),
    prisma.mailAccount.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        address: true,
        status: true,
        lastSyncAt: true,
        createdAt: true,
        updatedAt: true,
        messages: true,
      },
    }),
    prisma.mailFocusedSplit.findMany({ where: { userId } }),
    prisma.project.findMany({
      where: { userId },
      include: { stages: true },
    }),
    prisma.task.findMany({
      where: { userId },
      include: { tags: true },
    }),
    prisma.task.findMany({
      where: { assigneeId: userId, userId: { not: userId } },
      select: {
        id: true,
        workspaceId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.tag.findMany({ where: { userId } }),
    prisma.dailyAgenda.findMany({ where: { userId } }),
    prisma.habit.findMany({ where: { userId } }),
    prisma.weeklyFocusTarget.findMany({ where: { userId } }),
    prisma.timeEntry.findMany({ where: { userId } }),
    prisma.scheduledBlock.findMany({ where: { userId } }),
    prisma.focusSession.findMany({ where: { userId } }),
    prisma.schedulingRun.findMany({ where: { userId } }),
    prisma.taskDependency.findMany({ where: { userId } }),
    prisma.taskReminder.findMany({ where: { userId } }),
    prisma.proactiveNudge.findMany({ where: { userId } }),
    prisma.bookingPage.findMany({
      where: { userId },
      include: {
        bookings: {
          select: {
            id: true,
            start: true,
            end: true,
            timeZone: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    }),
    prisma.board.findMany({
      where: { userId },
      include: { columns: true },
    }),
    prisma.savedView.findMany({ where: { userId } }),
    prisma.page.findMany({
      where: { userId },
      include: {
        blocks: true,
        database: {
          include: {
            properties: true,
            records: { include: { values: true } },
            views: true,
          },
        },
        forms: true,
        publication: {
          select: {
            publishedAt: true,
            revokedAt: true,
            updatedAt: true,
          },
        },
      },
    }),
    prisma.pageAsset.findMany({ where: { userId } }),
    prisma.pageAccessGrant.findMany({
      where: { userId },
      select: { pageId: true, role: true, createdAt: true, updatedAt: true },
    }),
    prisma.pageAccessGrant.findMany({
      where: { grantedById: userId },
      select: { pageId: true, role: true, createdAt: true, updatedAt: true },
    }),
    prisma.pagePublication.findMany({
      where: { publishedById: userId },
      select: {
        pageId: true,
        publishedAt: true,
        revokedAt: true,
        updatedAt: true,
      },
    }),
    prisma.pageFolder.findMany({ where: { userId } }),
    prisma.pageTag.findMany({ where: { userId } }),
    prisma.pageSmartFolder.findMany({ where: { userId } }),
    prisma.pageTemplate.findMany({ where: { userId } }),
    prisma.pageComment.findMany({ where: { userId } }),
    prisma.pageFormSubmission.findMany({ where: { userId } }),
    prisma.pageRevision.findMany({ where: { userId } }),
    prisma.moodboard.findMany({
      where: { createdById: userId },
      include: { snapshots: true, collaborationState: true },
    }),
    prisma.moodboardAccessGrant.findMany({
      where: { userId },
      select: {
        moodboardId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.moodboardAccessGrant.findMany({
      where: { grantedById: userId },
      select: {
        moodboardId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.projectTemplate.findMany({
      where: { createdById: userId },
      include: {
        stages: true,
        roles: true,
        tasks: true,
        dependencies: true,
      },
    }),
    prisma.projectBlocker.findMany({ where: { createdById: userId } }),
    prisma.projectHealthUpdate.findMany({ where: { authorId: userId } }),
    prisma.taskActivity.findMany({ where: { actorId: userId } }),
    prisma.meetingNoteProposal.findMany({ where: { createdById: userId } }),
    prisma.aiPageChangeProposal.findMany({ where: { userId } }),
    prisma.aiConversation.findMany({
      where: { userId },
      include: { messages: { where: { userId } } },
    }),
    listMemoriesForExport(userId),
    prisma.externalIntegration.findMany({ where: { userId } }),
    prisma.workSchedule.findMany({
      where: { userId },
      include: { windows: true },
    }),
    prisma.energyProfileWindow.findMany({ where: { userId } }),
    prisma.flexibleHoursOverride.findMany({ where: { userId } }),
    prisma.bugReport.findMany({
      where: { userId },
      include: { attachments: true },
    }),
    prisma.taskProvider.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        name: true,
        enabled: true,
        syncEnabled: true,
        syncInterval: true,
        lastSyncedAt: true,
        expiresAt: true,
        defaultProjectId: true,
        error: true,
        createdAt: true,
        updatedAt: true,
        mappings: true,
      },
    }),
    prisma.taskChange.findMany({ where: { userId } }),
  ]);

  return {
    metadata: {
      format: "needt-account-export",
      version: 1,
      generatedAt: newDate().toISOString(),
      security:
        "Credentials, access tokens, refresh tokens, session secrets, reset tokens, webhook secrets, push secrets, and other people's private profile data are excluded.",
    },
    account: user,
    data: {
      connectedAccounts,
      calendars,
      mailAccounts,
      mailFocusedSplits,
      projects,
      tasks,
      taskAssignments,
      tags,
      dailyAgendas,
      habits,
      weeklyFocusTargets,
      timeEntries,
      scheduledBlocks,
      focusSessions,
      schedulingRuns,
      taskDependencies,
      taskReminders,
      proactiveNudges,
      bookingPages,
      boards,
      savedViews,
      pages,
      pageAssets,
      pageAccessReceived,
      pageAccessGranted,
      pagePublications,
      pageFolders,
      pageTags,
      pageSmartFolders,
      pageTemplates,
      pageComments,
      pageFormSubmissions,
      pageRevisions,
      moodboards,
      moodboardAccessReceived,
      moodboardAccessGranted,
      projectTemplates,
      projectBlockers,
      projectHealthUpdates,
      taskActivities,
      meetingNoteProposals,
      aiPageProposals,
      aiConversations,
      agentMemories,
      externalIntegrations,
      workSchedules,
      energyProfileWindows,
      flexibleHoursOverrides,
      bugReports,
      taskProviders,
      taskChanges,
    },
  };
}

export async function processAccountExport(requestId: string): Promise<void> {
  const request = await prisma.dataExportRequest.findUnique({
    where: { id: requestId },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!request || request.status === DataExportStatus.DOWNLOADED) return;
  if (!request.user.email) throw new Error("ACCOUNT_EMAIL_REQUIRED");

  await prisma.dataExportRequest.update({
    where: { id: requestId },
    data: { status: DataExportStatus.PROCESSING, errorCode: null },
  });

  try {
    const payload = await collectAccountExport(request.userId);
    const archive = gzipSync(Buffer.from(JSON.stringify(payload)));
    const token = randomBytes(32).toString("base64url");
    const expiresAt = addHours(newDate(), EXPORT_TTL_HOURS);
    await prisma.dataExportRequest.update({
      where: { id: requestId },
      data: {
        archive,
        tokenHash: hashAccountExportToken(token),
        expiresAt,
        status: DataExportStatus.READY,
      },
    });

    const link = `${publicAppUrl()}/api/account/export/download?token=${encodeURIComponent(token)}`;
    await EmailService.sendEmail({
      to: request.user.email,
      subject: `Your ${APP_NAME} data export is ready`,
      text: `Your account archive is ready. Download it within ${EXPORT_TTL_HOURS} hours: ${link}`,
      html: `<p>Your account archive is ready.</p><p><a href="${link}">Download your archive</a></p><p>This one-use link expires in ${EXPORT_TTL_HOURS} hours.</p>`,
    });
    await logger.info("Account export generated", { requestId }, LOG_SOURCE);
  } catch (error) {
    await prisma.dataExportRequest.update({
      where: { id: requestId },
      data: {
        status: DataExportStatus.FAILED,
        archive: null,
        tokenHash: null,
        expiresAt: null,
        errorCode: "EXPORT_GENERATION_FAILED",
      },
    });
    throw error;
  }
}

export async function expireAccountExports(): Promise<number> {
  const result = await prisma.dataExportRequest.updateMany({
    where: {
      status: DataExportStatus.READY,
      expiresAt: { lte: newDate() },
    },
    data: {
      status: DataExportStatus.EXPIRED,
      archive: null,
      tokenHash: null,
    },
  });
  return result.count;
}
