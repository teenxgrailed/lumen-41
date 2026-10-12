import {
  AccountDeletionStatus,
  Prisma,
  SavedViewVisibility,
  WorkspaceKind,
  WorkspaceRole,
} from "@prisma/client";

import { addCalendarDays, addMinutes, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { cancelRecurringBillingForDeletion } from "./account-billing";
import { revokeExternalAccessForDeletion } from "./account-external-access";

const LOG_SOURCE = "AccountDeletion";
export const ACCOUNT_DELETION_GRACE_DAYS = 7;

export async function scheduleAccountDeletion(
  userId: string,
  sessionHash: string
) {
  const scheduledFor = addCalendarDays(newDate(), ACCOUNT_DELETION_GRACE_DAYS);
  return prisma.$transaction(async (tx) => {
    const grant = await tx.accountReauthentication.findFirst({
      where: {
        userId,
        sessionHash,
        authenticatedAt: { not: null },
        consumedAt: null,
        expiresAt: { gt: newDate() },
      },
      select: { id: true },
      orderBy: { authenticatedAt: "desc" },
    });
    if (!grant) throw new Error("RECENT_AUTHENTICATION_REQUIRED");
    const consumed = await tx.accountReauthentication.updateMany({
      where: {
        id: grant.id,
        consumedAt: null,
        expiresAt: { gt: newDate() },
      },
      data: { consumedAt: newDate() },
    });
    if (consumed.count !== 1) {
      throw new Error("RECENT_AUTHENTICATION_REQUIRED");
    }
    return tx.accountDeletionRequest.upsert({
      where: { userId },
      create: { userId, scheduledFor },
      update: {
        status: AccountDeletionStatus.SCHEDULED,
        scheduledFor,
        canceledAt: null,
        completedAt: null,
        errorCode: null,
      },
    });
  });
}

export async function cancelAccountDeletion(userId: string) {
  const result = await prisma.accountDeletionRequest.updateMany({
    where: { userId, status: AccountDeletionStatus.SCHEDULED },
    data: { status: AccountDeletionStatus.CANCELED, canceledAt: newDate() },
  });
  if (result.count !== 1) throw new Error("DELETION_NOT_SCHEDULED");
}

async function tombstoneSharedContent(
  tx: Prisma.TransactionClient,
  userId: string,
  sharedWorkspaceIds: string[]
) {
  const workspaceFilter = { in: sharedWorkspaceIds };
  const now = newDate();

  const ownedPages = await tx.page.findMany({
    where: { userId, workspaceId: workspaceFilter },
    select: { id: true },
  });
  const pageIds = ownedPages.map(({ id }) => id);
  const ownedBoards = await tx.board.findMany({
    where: { userId, workspaceId: workspaceFilter },
    select: { id: true },
  });
  const boardIds = ownedBoards.map(({ id }) => id);
  const ownedProjects = await tx.project.findMany({
    where: { userId, workspaceId: workspaceFilter },
    select: { id: true },
  });
  const projectIds = ownedProjects.map(({ id }) => id);
  const ownedTemplates = await tx.projectTemplate.findMany({
    where: { createdById: userId, workspaceId: workspaceFilter },
    select: { id: true },
  });
  const templateIds = ownedTemplates.map(({ id }) => id);
  const ownedMoodboards = await tx.moodboard.findMany({
    where: { createdById: userId, workspaceId: workspaceFilter },
    select: { id: true },
  });
  const moodboardIds = ownedMoodboards.map(({ id }) => id);

  await tx.pagePublication.deleteMany({ where: { page: { userId } } });
  await Promise.all([
    tx.project.updateMany({
      where: { userId, workspaceId: workspaceFilter },
      data: {
        userId: null,
        name: "Deleted project",
        description: null,
        color: null,
        icon: null,
        externalId: null,
        externalSource: null,
        lastSyncedAt: null,
        status: "archived",
      },
    }),
    tx.task.updateMany({
      where: { userId, workspaceId: workspaceFilter },
      data: {
        userId: null,
        assigneeId: null,
        title: "Deleted task",
        description: null,
        externalTaskId: null,
        externalListId: null,
        source: null,
        syncError: null,
        syncHash: null,
        properties: Prisma.JsonNull,
        isArchived: true,
        archivedAt: now,
      },
    }),
    tx.taskDependency.updateMany({
      where: { userId, workspaceId: workspaceFilter },
      data: { userId: null },
    }),
    tx.board.updateMany({
      where: { userId, workspaceId: workspaceFilter },
      data: { userId: null, name: "Deleted board", icon: null },
    }),
    tx.savedView.updateMany({
      where: {
        userId,
        workspaceId: workspaceFilter,
        visibility: SavedViewVisibility.WORKSPACE,
      },
      data: {
        userId: null,
        name: "Deleted view",
        filters: Prisma.JsonNull,
        sort: Prisma.JsonNull,
        archivedAt: now,
      },
    }),
    tx.savedView.deleteMany({
      where: { userId, visibility: SavedViewVisibility.PERSONAL },
    }),
    tx.page.updateMany({
      where: { userId, workspaceId: workspaceFilter },
      data: {
        userId: null,
        title: "Deleted page",
        icon: null,
        coverUrl: null,
        isPrivate: true,
        trashedAt: now,
      },
    }),
    tx.pageFolder.updateMany({
      where: { userId, workspaceId: workspaceFilter },
      data: {
        userId: null,
        name: "Deleted folder",
        color: null,
        archivedAt: now,
      },
    }),
    tx.pageTag.updateMany({
      where: { userId, workspaceId: workspaceFilter },
      data: {
        userId: null,
        name: "Deleted tag",
        color: null,
        archivedAt: now,
      },
    }),
    tx.pageSmartFolder.updateMany({
      where: { userId, workspaceId: workspaceFilter },
      data: {
        userId: null,
        name: "Deleted smart folder",
        query: {},
        archivedAt: now,
      },
    }),
    tx.pageAsset.updateMany({
      where: { userId },
      data: {
        userId: null,
        originalName: "deleted-asset",
        mimeType: "application/octet-stream",
        size: 0,
        bytes: Buffer.alloc(0),
      },
    }),
    tx.pageRevision.updateMany({
      where: { userId },
      data: { userId: null, snapshot: {} },
    }),
    tx.pageAccessGrant.updateMany({
      where: { grantedById: userId },
      data: { grantedById: null },
    }),
    tx.moodboard.updateMany({
      where: { createdById: userId, workspaceId: workspaceFilter },
      data: {
        createdById: null,
        title: "Deleted moodboard",
        archivedAt: now,
      },
    }),
    tx.moodboardAccessGrant.updateMany({
      where: { grantedById: userId },
      data: { grantedById: null },
    }),
    tx.projectBlocker.updateMany({
      where: { createdById: userId },
      data: { createdById: null, title: null },
    }),
    tx.projectHealthUpdate.updateMany({
      where: { authorId: userId },
      data: { authorId: null, summary: "Update by deleted account" },
    }),
    tx.taskActivity.updateMany({
      where: { actorId: userId },
      data: {
        actorId: null,
        action: "account_deleted",
        metadata: Prisma.JsonNull,
      },
    }),
    tx.meetingNoteProposal.updateMany({
      where: { createdById: userId },
      data: { createdById: null, summary: "", actions: [] },
    }),
    tx.projectTemplate.updateMany({
      where: { createdById: userId, workspaceId: workspaceFilter },
      data: {
        createdById: null,
        name: "Deleted template",
        description: null,
        color: null,
        icon: null,
      },
    }),
  ]);

  if (pageIds.length > 0) {
    await Promise.all([
      tx.pageBlock.updateMany({
        where: { pageId: { in: pageIds } },
        data: { content: {} },
      }),
      tx.pageCollaborationState.updateMany({
        where: { pageId: { in: pageIds } },
        data: { state: Buffer.alloc(0) },
      }),
      tx.pageRevision.updateMany({
        where: { pageId: { in: pageIds } },
        data: { snapshot: {} },
      }),
      tx.pageForm.updateMany({
        where: { pageId: { in: pageIds } },
        data: { title: "Deleted form", schema: {}, isActive: false },
      }),
      tx.databaseProperty.updateMany({
        where: { database: { pageId: { in: pageIds } } },
        data: { name: "Deleted property", config: Prisma.JsonNull },
      }),
      tx.databaseValue.updateMany({
        where: { record: { database: { pageId: { in: pageIds } } } },
        data: { value: Prisma.JsonNull },
      }),
      tx.databaseView.updateMany({
        where: { database: { pageId: { in: pageIds } } },
        data: {
          name: "Deleted view",
          filters: Prisma.JsonNull,
          sort: Prisma.JsonNull,
          group: Prisma.JsonNull,
          config: Prisma.JsonNull,
        },
      }),
    ]);
  }
  if (boardIds.length > 0) {
    await tx.boardColumn.updateMany({
      where: { boardId: { in: boardIds } },
      data: { name: "Deleted column", color: null, mappingKey: null },
    });
  }
  if (projectIds.length > 0) {
    await tx.projectStage.updateMany({
      where: { projectId: { in: projectIds } },
      data: { name: "Deleted stage", color: null },
    });
  }
  if (templateIds.length > 0) {
    await Promise.all([
      tx.projectTemplateStage.updateMany({
        where: { templateId: { in: templateIds } },
        data: { name: "Deleted stage", color: null },
      }),
      tx.projectTemplateRole.updateMany({
        where: { templateId: { in: templateIds } },
        data: { name: "Deleted role", color: null },
      }),
      tx.projectTemplateTask.updateMany({
        where: { templateId: { in: templateIds } },
        data: { title: "Deleted task", description: null },
      }),
    ]);
  }
  if (moodboardIds.length > 0) {
    await Promise.all([
      tx.moodboardCollaborationState.updateMany({
        where: { moodboardId: { in: moodboardIds } },
        data: { state: Buffer.alloc(0), lastSnapshotAt: null },
      }),
      tx.moodboardSnapshot.updateMany({
        where: { moodboardId: { in: moodboardIds } },
        data: { scene: {} },
      }),
    ]);
  }
}

async function deletePersonalWorkspace(
  tx: Prisma.TransactionClient,
  workspaceId: string
) {
  await tx.task.updateMany({
    where: { workspaceId },
    data: {
      recurrenceMasterId: null,
      dependsOnId: null,
      habitId: null,
      stageId: null,
      boardId: null,
      boardColumnId: null,
      projectId: null,
    },
  });
  await Promise.all([
    tx.meetingNoteProposal.deleteMany({ where: { workspaceId } }),
    tx.projectHealthUpdate.deleteMany({ where: { workspaceId } }),
    tx.taskActivity.deleteMany({ where: { workspaceId } }),
    tx.taskDependency.deleteMany({ where: { workspaceId } }),
    tx.schedulingRun.deleteMany({ where: { workspaceId } }),
    tx.agentMemory.deleteMany({ where: { workspaceId } }),
    tx.aiMessage.deleteMany({ where: { workspaceId } }),
    tx.weeklyFocusTarget.deleteMany({ where: { workspaceId } }),
    tx.savedView.deleteMany({ where: { workspaceId } }),
  ]);
  await tx.aiConversation.deleteMany({ where: { workspaceId } });
  await tx.task.deleteMany({ where: { workspaceId } });
  await Promise.all([
    tx.habit.deleteMany({ where: { workspaceId } }),
    tx.page.deleteMany({ where: { workspaceId } }),
    tx.moodboard.deleteMany({ where: { workspaceId } }),
    tx.board.deleteMany({ where: { workspaceId } }),
    tx.project.deleteMany({ where: { workspaceId } }),
    tx.projectTemplate.deleteMany({ where: { workspaceId } }),
  ]);
  await Promise.all([
    tx.pageFolder.deleteMany({ where: { workspaceId } }),
    tx.pageTag.deleteMany({ where: { workspaceId } }),
    tx.pageSmartFolder.deleteMany({ where: { workspaceId } }),
    tx.workspaceInvite.deleteMany({ where: { workspaceId } }),
    tx.workspaceMember.deleteMany({ where: { workspaceId } }),
  ]);
  await tx.workspace.delete({ where: { id: workspaceId } });
}

async function prepareSharedWorkspacesForDeparture(
  tx: Prisma.TransactionClient,
  userId: string,
  workspaceIds: string[]
): Promise<string[]> {
  const survivingWorkspaceIds: string[] = [];
  for (const workspaceId of workspaceIds) {
    const memberships = await tx.workspaceMember.findMany({
      where: { workspaceId },
      select: { userId: true, role: true },
      orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
    });
    const departing = memberships.find((member) => member.userId === userId);
    const remaining = memberships.filter((member) => member.userId !== userId);
    if (remaining.length === 0) {
      await deletePersonalWorkspace(tx, workspaceId);
      continue;
    }
    if (
      departing?.role === WorkspaceRole.OWNER &&
      !remaining.some((member) => member.role === WorkspaceRole.OWNER)
    ) {
      await tx.workspaceMember.update({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: remaining[0].userId,
          },
        },
        data: { role: WorkspaceRole.OWNER },
      });
    }
    survivingWorkspaceIds.push(workspaceId);
  }
  return survivingWorkspaceIds;
}

async function findSharedWorkspaceIdsWithAuthoredContent(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<string[]> {
  const results = await Promise.all([
    tx.project.findMany({ where: { userId }, select: { workspaceId: true } }),
    tx.task.findMany({ where: { userId }, select: { workspaceId: true } }),
    tx.taskDependency.findMany({
      where: { userId },
      select: { workspaceId: true },
    }),
    tx.board.findMany({ where: { userId }, select: { workspaceId: true } }),
    tx.savedView.findMany({ where: { userId }, select: { workspaceId: true } }),
    tx.page.findMany({ where: { userId }, select: { workspaceId: true } }),
    tx.pageFolder.findMany({
      where: { userId },
      select: { workspaceId: true },
    }),
    tx.pageTag.findMany({ where: { userId }, select: { workspaceId: true } }),
    tx.pageSmartFolder.findMany({
      where: { userId },
      select: { workspaceId: true },
    }),
    tx.moodboard.findMany({
      where: { createdById: userId },
      select: { workspaceId: true },
    }),
    tx.projectTemplate.findMany({
      where: { createdById: userId },
      select: { workspaceId: true },
    }),
  ]);
  const candidateIds = [
    ...new Set(
      results
        .flat()
        .map(({ workspaceId }) => workspaceId)
        .filter((workspaceId): workspaceId is string => Boolean(workspaceId))
    ),
  ];
  if (candidateIds.length === 0) return [];
  const shared = await tx.workspace.findMany({
    where: { id: { in: candidateIds }, kind: WorkspaceKind.SHARED },
    select: { id: true },
  });
  return shared.map(({ id }) => id);
}

async function removeUnscopedPersonalData(
  tx: Prisma.TransactionClient,
  userId: string
) {
  await tx.task.updateMany({
    where: { userId, workspaceId: null },
    data: {
      recurrenceMasterId: null,
      dependsOnId: null,
      habitId: null,
      stageId: null,
      boardId: null,
      boardColumnId: null,
      projectId: null,
    },
  });
  await Promise.all([
    tx.calendarFeed.deleteMany({ where: { userId } }),
    tx.connectedAccount.deleteMany({ where: { userId } }),
    tx.task.deleteMany({ where: { userId, workspaceId: null } }),
    tx.project.deleteMany({ where: { userId, workspaceId: null } }),
    tx.board.deleteMany({ where: { userId, workspaceId: null } }),
    tx.savedView.deleteMany({ where: { userId, workspaceId: null } }),
    tx.page.deleteMany({ where: { userId, workspaceId: null } }),
    tx.pageFolder.deleteMany({ where: { userId, workspaceId: null } }),
    tx.pageTag.deleteMany({ where: { userId, workspaceId: null } }),
    tx.pageSmartFolder.deleteMany({ where: { userId, workspaceId: null } }),
    tx.tag.deleteMany({ where: { userId } }),
    tx.timeEntry.deleteMany({ where: { userId } }),
    tx.jobRecord.deleteMany({ where: { userId } }),
  ]);
}

export async function finalizeAccountDeletion(
  requestId: string
): Promise<void> {
  try {
    const processingCutoff = addMinutes(newDate(), -30);
    const claimed = await prisma.accountDeletionRequest.updateMany({
      where: {
        id: requestId,
        scheduledFor: { lte: newDate() },
        userId: { not: null },
        OR: [
          {
            status: {
              in: [
                AccountDeletionStatus.SCHEDULED,
                AccountDeletionStatus.FAILED,
              ],
            },
          },
          {
            status: AccountDeletionStatus.PROCESSING,
            updatedAt: { lte: processingCutoff },
          },
        ],
      },
      data: { status: AccountDeletionStatus.PROCESSING, errorCode: null },
    });
    if (claimed.count !== 1) return;
    const billingRequest = await prisma.accountDeletionRequest.findUnique({
      where: { id: requestId },
      select: { userId: true },
    });
    if (billingRequest?.userId) {
      await cancelRecurringBillingForDeletion(billingRequest.userId);
      /* Before the rows go: stopping a calendar channel and revoking a grant
         both need the tokens the transaction below deletes. */
      await revokeExternalAccessForDeletion(billingRequest.userId).catch(
        async (error) => {
          await logger.warn(
            "External access revocation failed; deletion continues",
            {
              requestId,
              error: error instanceof Error ? error.message : String(error),
            },
            LOG_SOURCE
          );
        }
      );
    }
    await prisma.$transaction(
      async (tx) => {
        const request = await tx.accountDeletionRequest.findUnique({
          where: { id: requestId },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                personalWorkspace: { select: { id: true } },
                workspaceMemberships: {
                  where: { workspace: { kind: WorkspaceKind.SHARED } },
                  select: { workspaceId: true },
                },
              },
            },
          },
        });
        if (!request?.user) return;
        const { id: userId, email } = request.user;
        const currentSharedWorkspaceIds = request.user.workspaceMemberships.map(
          ({ workspaceId }) => workspaceId
        );
        const authoredSharedWorkspaceIds =
          await findSharedWorkspaceIdsWithAuthoredContent(tx, userId);
        const survivingSharedWorkspaceIds =
          await prepareSharedWorkspacesForDeparture(
            tx,
            userId,
            currentSharedWorkspaceIds
          );
        await tombstoneSharedContent(tx, userId, [
          ...new Set([
            ...survivingSharedWorkspaceIds,
            ...authoredSharedWorkspaceIds,
          ]),
        ]);
        if (request.user.personalWorkspace) {
          await deletePersonalWorkspace(tx, request.user.personalWorkspace.id);
        }
        await removeUnscopedPersonalData(tx, userId);

        if (email) {
          await Promise.all([
            tx.verificationToken.deleteMany({
              where: { identifier: { equals: email, mode: "insensitive" } },
            }),
            tx.workspaceInvite.deleteMany({
              where: { email: { equals: email, mode: "insensitive" } },
            }),
            tx.pendingWaitlist.deleteMany({
              where: { email: { equals: email, mode: "insensitive" } },
            }),
            tx.waitlist.deleteMany({
              where: { email: { equals: email, mode: "insensitive" } },
            }),
          ]);
          await tx.$executeRaw`
            DELETE FROM "Log"
            WHERE "message" ILIKE ${`%${email}%`}
               OR COALESCE("metadata"::text, '') ILIKE ${`%${email}%`}
               OR COALESCE("metadata"::text, '') LIKE ${`%${userId}%`}
          `;
        }
        await tx.$executeRaw`
          UPDATE "CronState"
          SET "pendingUserIds" = COALESCE(
            (
              SELECT jsonb_agg(value)
              FROM jsonb_array_elements(COALESCE("pendingUserIds"::jsonb, '[]'::jsonb)) value
              WHERE value #>> '{}' <> ${userId}
            ),
            '[]'::jsonb
          )
          WHERE "pendingUserIds" IS NOT NULL
        `;

        await tx.user.delete({ where: { id: userId } });
        await tx.accountDeletionRequest.update({
          where: { id: requestId },
          data: {
            status: AccountDeletionStatus.COMPLETED,
            completedAt: newDate(),
            errorCode: null,
          },
        });
      },
      { maxWait: 10_000, timeout: 120_000 }
    );
    await logger.info("Account deletion finalized", { requestId }, LOG_SOURCE);
  } catch (error) {
    await prisma.accountDeletionRequest
      .update({
        where: { id: requestId },
        data: {
          status: AccountDeletionStatus.FAILED,
          errorCode: "ACCOUNT_DELETION_FAILED",
        },
      })
      .catch(() => undefined);
    throw error;
  }
}

export async function finalizeDueAccountDeletions(): Promise<number> {
  const due = await prisma.accountDeletionRequest.findMany({
    where: {
      scheduledFor: { lte: newDate() },
      userId: { not: null },
      OR: [
        {
          status: {
            in: [AccountDeletionStatus.SCHEDULED, AccountDeletionStatus.FAILED],
          },
        },
        {
          status: AccountDeletionStatus.PROCESSING,
          updatedAt: { lte: addMinutes(newDate(), -30) },
        },
      ],
    },
    select: { id: true },
    take: 25,
    orderBy: { scheduledFor: "asc" },
  });
  for (const request of due) {
    await finalizeAccountDeletion(request.id).catch(async (error) => {
      await logger.error(
        "Account deletion sweep item failed",
        {
          requestId: request.id,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    });
  }
  return due.length;
}
