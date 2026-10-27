import { encode } from "next-auth/jwt";

import {
  cancelAccountDeletion,
  finalizeAccountDeletion,
  scheduleAccountDeletion,
} from "@/services/account/account-deletion";
import {
  collectAccountExport,
  hashAccountExportToken,
} from "@/services/account/account-export";
import { expect, request as playwrightRequest, test } from "@playwright/test";
import {
  AccountDeletionStatus,
  PageBlockType,
  WorkspaceKind,
  WorkspaceRole,
} from "@prisma/client";
import { hash } from "bcryptjs";

import { addCalendarDays, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

async function authenticatedRequest(userId: string) {
  const secret = process.env.NEXTAUTH_SECRET;
  expect(
    secret,
    "NEXTAUTH_SECRET is required for account lifecycle E2E"
  ).toBeTruthy();
  const sessionToken = await encode({
    secret: secret!,
    token: { sub: userId },
  });
  return playwrightRequest.newContext({
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
    extraHTTPHeaders: {
      cookie: `next-auth.session-token=${sessionToken}`,
    },
  });
}

test.describe("account export and deletion lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  const runId = `${newDate().getTime()}-${Math.random().toString(36).slice(2)}`;
  const ownerEmail = `account-owner-${runId}@needt.local`;
  const teammateEmail = `account-teammate-${runId}@needt.local`;
  let ownerId = "";
  let teammateId = "";
  let personalWorkspaceId = "";
  let sharedWorkspaceId = "";
  let formerSharedWorkspaceId = "";
  let sharedOwnerTaskId = "";
  let sharedTeammateTaskId = "";
  let sharedPageId = "";
  let sharedPageBlockId = "";
  let teammateCommentId = "";
  let sharedMoodboardId = "";
  let teammateRevisionId = "";
  let formerSharedPageId = "";
  const overlappingVerificationIdentifier = `prefix-${ownerEmail}`;

  test.beforeAll(async () => {
    const owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        name: "Lifecycle owner",
        emailVerified: newDate(),
        lastAuthenticatedAt: newDate(),
      },
    });
    const teammate = await prisma.user.create({
      data: { email: teammateEmail, name: "Lifecycle teammate" },
    });
    ownerId = owner.id;
    teammateId = teammate.id;
    await prisma.account.create({
      data: {
        userId: ownerId,
        type: "credentials",
        provider: "credentials",
        providerAccountId: ownerEmail,
        id_token: await hash("Lifecycle-password-1", 8),
      },
    });

    const personal = await prisma.workspace.create({
      data: {
        name: "Lifecycle personal",
        kind: WorkspaceKind.PERSONAL,
        personalOwnerId: ownerId,
        members: { create: { userId: ownerId, role: WorkspaceRole.OWNER } },
      },
    });
    const shared = await prisma.workspace.create({
      data: {
        name: "Lifecycle shared",
        kind: WorkspaceKind.SHARED,
        members: {
          create: [
            { userId: ownerId, role: WorkspaceRole.OWNER },
            { userId: teammateId, role: WorkspaceRole.EDITOR },
          ],
        },
      },
    });
    personalWorkspaceId = personal.id;
    sharedWorkspaceId = shared.id;
    const formerShared = await prisma.workspace.create({
      data: {
        name: "Former lifecycle shared",
        kind: WorkspaceKind.SHARED,
        members: {
          create: { userId: teammateId, role: WorkspaceRole.OWNER },
        },
      },
    });
    formerSharedWorkspaceId = formerShared.id;

    await prisma.task.create({
      data: {
        title: "Private lifecycle task",
        description: "must disappear",
        status: "todo",
        userId: ownerId,
        workspaceId: personalWorkspaceId,
      },
    });
    const sharedOwnerTask = await prisma.task.create({
      data: {
        title: "Shared owner lifecycle task",
        description: "must become a tombstone",
        status: "todo",
        userId: ownerId,
        workspaceId: sharedWorkspaceId,
      },
    });
    const sharedTeammateTask = await prisma.task.create({
      data: {
        title: "Shared teammate lifecycle task",
        status: "todo",
        userId: teammateId,
        workspaceId: sharedWorkspaceId,
      },
    });
    sharedOwnerTaskId = sharedOwnerTask.id;
    sharedTeammateTaskId = sharedTeammateTask.id;

    const page = await prisma.page.create({
      data: {
        title: "Owner shared page",
        userId: ownerId,
        workspaceId: sharedWorkspaceId,
        blocks: {
          create: {
            type: PageBlockType.PARAGRAPH,
            content: { text: "owner private page content" },
          },
        },
      },
      include: { blocks: true },
    });
    sharedPageId = page.id;
    sharedPageBlockId = page.blocks[0].id;
    const teammatePage = await prisma.page.create({
      data: {
        title: "Teammate shared page",
        userId: teammateId,
        workspaceId: sharedWorkspaceId,
      },
    });
    const formerSharedPage = await prisma.page.create({
      data: {
        title: "Former member page",
        userId: ownerId,
        workspaceId: formerSharedWorkspaceId,
        blocks: {
          create: {
            type: PageBlockType.PARAGRAPH,
            content: { text: "former member content must be scrubbed" },
          },
        },
      },
    });
    formerSharedPageId = formerSharedPage.id;
    const comment = await prisma.pageComment.create({
      data: {
        pageId: page.id,
        blockId: page.blocks[0].id,
        userId: teammateId,
        body: "teammate content must survive",
      },
    });
    teammateCommentId = comment.id;
    const revision = await prisma.pageRevision.create({
      data: {
        pageId: page.id,
        userId: teammateId,
        snapshot: { text: "collaborator snapshot of owner content" },
      },
    });
    teammateRevisionId = revision.id;
    await prisma.pageCollaborationState.create({
      data: { pageId: page.id, state: Buffer.from("owner yjs content") },
    });
    await prisma.pageAsset.createMany({
      data: [
        {
          pageId: page.id,
          userId: ownerId,
          originalName: "owner.txt",
          mimeType: "text/plain",
          size: 11,
          bytes: Buffer.from("owner asset"),
        },
        {
          pageId: teammatePage.id,
          userId: ownerId,
          originalName: "owner-on-teammate.txt",
          mimeType: "text/plain",
          size: 20,
          bytes: Buffer.from("owner uploaded asset"),
        },
        {
          pageId: page.id,
          userId: teammateId,
          originalName: "teammate.txt",
          mimeType: "text/plain",
          size: 21,
          bytes: Buffer.from("teammate private asset"),
        },
      ],
    });
    const moodboard = await prisma.moodboard.create({
      data: {
        title: "Owner shared moodboard",
        createdById: ownerId,
        workspaceId: sharedWorkspaceId,
        snapshots: { create: { scene: { secret: "owner scene" } } },
      },
    });
    sharedMoodboardId = moodboard.id;

    await prisma.connectedAccount.create({
      data: {
        userId: ownerId,
        provider: "GOOGLE",
        email: ownerEmail,
        accessToken: "owner-access-token-must-disappear",
        refreshToken: "owner-refresh-token-must-disappear",
        expiresAt: addCalendarDays(newDate(), 1),
      },
    });
    await prisma.mailAccount.create({
      data: {
        userId: ownerId,
        provider: "IMAP",
        address: ownerEmail,
        encryptedCredentials: "encrypted-mail-secret-must-disappear",
        messages: {
          create: {
            externalId: `message-${runId}`,
            toAddresses: [ownerEmail],
            subject: "Owned mail",
            snippet: "mail snippet",
            date: newDate(),
            labels: [],
          },
        },
      },
    });
    await prisma.verificationToken.create({
      data: {
        identifier: `verify:${ownerEmail}`,
        token: `verification-secret-${runId}`,
        expires: addCalendarDays(newDate(), 1),
      },
    });
    await prisma.verificationToken.create({
      data: {
        identifier: overlappingVerificationIdentifier,
        token: `unrelated-verification-${runId}`,
        expires: addCalendarDays(newDate(), 1),
      },
    });
    await prisma.log.create({
      data: {
        level: "INFO",
        message: `lifecycle trace for ${ownerEmail}`,
        metadata: { userId: ownerId },
        expiresAt: addCalendarDays(newDate(), 1),
      },
    });
  });

  test.afterAll(async () => {
    if (sharedWorkspaceId) {
      await prisma.pageComment.deleteMany({
        where: { page: { workspaceId: sharedWorkspaceId } },
      });
      await prisma.page.deleteMany({
        where: { workspaceId: sharedWorkspaceId },
      });
      await prisma.moodboard.deleteMany({
        where: { workspaceId: sharedWorkspaceId },
      });
      await prisma.task.deleteMany({
        where: { workspaceId: sharedWorkspaceId },
      });
      await prisma.workspace
        .delete({ where: { id: sharedWorkspaceId } })
        .catch(() => undefined);
    }
    if (formerSharedWorkspaceId) {
      await prisma.page.deleteMany({
        where: { workspaceId: formerSharedWorkspaceId },
      });
      await prisma.workspace
        .delete({ where: { id: formerSharedWorkspaceId } })
        .catch(() => undefined);
    }
    await prisma.verificationToken.deleteMany({
      where: { identifier: overlappingVerificationIdentifier },
    });
    if (teammateId) {
      await prisma.user
        .delete({ where: { id: teammateId } })
        .catch(() => undefined);
    }
    if (ownerId) {
      await prisma.user
        .delete({ where: { id: ownerId } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  test("exports owned data without workspace leakage or credentials", async () => {
    const exported = await collectAccountExport(ownerId);
    const serialized = JSON.stringify(exported);
    expect(exported.account.email).toBe(ownerEmail);
    expect(exported.data.tasks.map(({ id }) => id)).toContain(
      sharedOwnerTaskId
    );
    expect(exported.data.tasks.map(({ id }) => id)).not.toContain(
      sharedTeammateTaskId
    );
    expect(exported.data.mailAccounts[0].messages[0].subject).toBe(
      "Owned mail"
    );
    expect(serialized).not.toContain("owner-access-token-must-disappear");
    expect(serialized).not.toContain("owner-refresh-token-must-disappear");
    expect(serialized).not.toContain("encrypted-mail-secret-must-disappear");
    expect(serialized).not.toContain(teammateEmail);
    expect(serialized).toContain("owner.txt");
    expect(serialized).toContain("owner-on-teammate.txt");
    expect(serialized).not.toContain('"originalName":"teammate.txt"');
  });

  test("requires current-session reauthentication through the API", async () => {
    const client = await authenticatedRequest(ownerId);
    const reauth = await client.post("/api/account/reauth", {
      data: { password: "Lifecycle-password-1" },
    });
    expect(reauth.status()).toBe(200);
    const schedule = await client.post("/api/account/deletion");
    expect(schedule.status()).toBe(202);
    const status = await client.get("/api/account/lifecycle");
    expect((await status.json()).deletion).not.toBeNull();
    const cancel = await client.delete("/api/account/deletion");
    expect(cancel.status()).toBe(200);
    await client.dispose();
  });

  test("download links are one-use and purge expired archives without the worker", async () => {
    const activeToken = `active-export-${runId}`;
    await prisma.dataExportRequest.create({
      data: {
        userId: ownerId,
        status: "READY",
        archive: Buffer.from("account archive"),
        tokenHash: hashAccountExportToken(activeToken),
        expiresAt: addCalendarDays(newDate(), 1),
      },
    });
    const client = await playwrightRequest.newContext({
      baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
    });
    const first = await client.get(
      `/api/account/export/download?token=${encodeURIComponent(activeToken)}`
    );
    expect(first.status()).toBe(200);
    expect(await first.body()).toEqual(Buffer.from("account archive"));
    const second = await client.get(
      `/api/account/export/download?token=${encodeURIComponent(activeToken)}`
    );
    expect(second.status()).toBe(410);

    const expiredToken = `expired-export-${runId}`;
    const expired = await prisma.dataExportRequest.create({
      data: {
        userId: ownerId,
        status: "READY",
        archive: Buffer.from("expired archive"),
        tokenHash: hashAccountExportToken(expiredToken),
        expiresAt: addCalendarDays(newDate(), -1),
      },
    });
    const expiredResponse = await client.get(
      `/api/account/export/download?token=${encodeURIComponent(expiredToken)}`
    );
    expect(expiredResponse.status()).toBe(410);
    expect(
      await prisma.dataExportRequest.findUnique({ where: { id: expired.id } })
    ).toMatchObject({ status: "EXPIRED", archive: null, tokenHash: null });
    await client.dispose();
  });

  test("supports cancellation during the seven-day grace window", async () => {
    const sessionHash = `owner-session-${runId}`;
    await prisma.accountReauthentication.create({
      data: {
        userId: ownerId,
        sessionHash,
        authenticatedAt: newDate(),
        expiresAt: addCalendarDays(newDate(), 1),
      },
    });
    await expect(
      scheduleAccountDeletion(ownerId, `stolen-session-${runId}`)
    ).rejects.toThrow("RECENT_AUTHENTICATION_REQUIRED");
    const scheduled = await scheduleAccountDeletion(ownerId, sessionHash);
    expect(scheduled.status).toBe(AccountDeletionStatus.SCHEDULED);
    expect(scheduled.scheduledFor.getTime()).toBeGreaterThan(
      addCalendarDays(newDate(), 6).getTime()
    );
    await cancelAccountDeletion(ownerId);
    const canceled = await prisma.accountDeletionRequest.findUnique({
      where: { userId: ownerId },
    });
    expect(canceled?.status).toBe(AccountDeletionStatus.CANCELED);
  });

  test("removes personal data and preserves scrubbed shared tombstones", async () => {
    await prisma.user.update({
      where: { id: ownerId },
      data: { lastAuthenticatedAt: newDate() },
    });
    const sessionHash = `owner-final-session-${runId}`;
    await prisma.accountReauthentication.create({
      data: {
        userId: ownerId,
        sessionHash,
        authenticatedAt: newDate(),
        expiresAt: addCalendarDays(newDate(), 1),
      },
    });
    const scheduled = await scheduleAccountDeletion(ownerId, sessionHash);
    await prisma.accountDeletionRequest.update({
      where: { id: scheduled.id },
      data: { scheduledFor: addCalendarDays(newDate(), -1) },
    });
    await finalizeAccountDeletion(scheduled.id);

    expect(await prisma.user.findUnique({ where: { id: ownerId } })).toBeNull();
    expect(
      await prisma.workspace.findUnique({ where: { id: personalWorkspaceId } })
    ).toBeNull();
    expect(
      await prisma.connectedAccount.count({ where: { userId: ownerId } })
    ).toBe(0);
    expect(await prisma.mailAccount.count({ where: { userId: ownerId } })).toBe(
      0
    );
    expect(
      await prisma.verificationToken.count({
        where: { identifier: { equals: ownerEmail, mode: "insensitive" } },
      })
    ).toBe(0);
    expect(
      await prisma.verificationToken.count({
        where: { identifier: overlappingVerificationIdentifier },
      })
    ).toBe(1);

    const ownerTask = await prisma.task.findUnique({
      where: { id: sharedOwnerTaskId },
    });
    expect(ownerTask).toMatchObject({ userId: null, title: "Deleted task" });
    expect(
      await prisma.task.findUnique({ where: { id: sharedTeammateTaskId } })
    ).toMatchObject({
      userId: teammateId,
      title: "Shared teammate lifecycle task",
    });
    expect(
      await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: sharedWorkspaceId,
            userId: teammateId,
          },
        },
      })
    ).toMatchObject({ role: WorkspaceRole.OWNER });
    expect(
      await prisma.page.findUnique({ where: { id: sharedPageId } })
    ).toMatchObject({
      userId: null,
      title: "Deleted page",
    });
    expect(
      await prisma.page.findUnique({ where: { id: formerSharedPageId } })
    ).toMatchObject({ userId: null, title: "Deleted page" });
    expect(
      await prisma.pageBlock.findUnique({ where: { id: sharedPageBlockId } })
    ).toMatchObject({ content: {} });
    expect(
      await prisma.pageComment.findUnique({ where: { id: teammateCommentId } })
    ).toMatchObject({
      body: "teammate content must survive",
      userId: teammateId,
    });
    expect(
      await prisma.pageRevision.findUnique({
        where: { id: teammateRevisionId },
      })
    ).toMatchObject({ userId: teammateId, snapshot: {} });
    const collaborationState = await prisma.pageCollaborationState.findUnique({
      where: { pageId: sharedPageId },
    });
    expect(collaborationState?.state.byteLength).toBe(0);
    expect(
      await prisma.moodboard.findUnique({ where: { id: sharedMoodboardId } })
    ).toMatchObject({ createdById: null, title: "Deleted moodboard" });

    const deletion = await prisma.accountDeletionRequest.findUnique({
      where: { id: scheduled.id },
    });
    expect(deletion).toMatchObject({
      userId: null,
      status: AccountDeletionStatus.COMPLETED,
    });

    const residues = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "Log"
      WHERE "message" ILIKE ${`%${ownerEmail}%`}
         OR COALESCE("metadata"::text, '') LIKE ${`%${ownerId}%`}
    `;
    expect(Number(residues[0].count)).toBe(0);
  });
});
