import { NextRequest, NextResponse } from "next/server";

import { MailProvider, TaskReminderKind, WorkspaceRole } from "@prisma/client";

import { toPublicMailMessage } from "@/lib/api/public-records";
import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { getMailMessage, updateMailMessage } from "@/lib/mail-db";
import {
  fetchGmailBody,
  fetchImapBody,
  fetchOutlookBody,
  mutateGmailMessage,
  mutateImapMessage,
  mutateOutlookMessage,
} from "@/lib/mail/providers";
import { sanitizeMailHtml } from "@/lib/mail/sanitize";
import {
  mailV3FieldsSchema,
  parseV3Fields,
  trashedAtFrom,
} from "@/lib/needt3/api-fields";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "MailMessageAPI";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    const { id } = await params;
    let message = await getMailMessage(auth.userId, id);
    if (!message) {
      return NextResponse.json(
        { error: "Mail message not found." },
        { status: 404 }
      );
    }

    if (!message.bodyHtml) {
      const raw =
        message.account.provider === MailProvider.GMAIL
          ? await fetchGmailBody(message.account, message.externalId)
          : message.account.provider === MailProvider.OUTLOOK
            ? await fetchOutlookBody(message.account, message.externalId)
            : await fetchImapBody(message.account, message.externalId);
      const sanitized = sanitizeMailHtml(raw);
      await updateMailMessage(auth.userId, id, { bodyHtml: sanitized.html });
      message = { ...message, bodyHtml: sanitized.html };
    }

    const sanitized = sanitizeMailHtml(message.bodyHtml || "");
    return NextResponse.json({
      ...toPublicMailMessage(message),
      bodyHtml: sanitized.html,
      hasRemoteImages: sanitized.hasRemoteImages,
    });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to load mail message",
      LOG_SOURCE,
      "Could not load this mail message."
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    const { id } = await params;
    const message = await getMailMessage(auth.userId, id);
    if (!message) {
      return NextResponse.json(
        { error: "Mail message not found." },
        { status: 404 }
      );
    }
    const body = (await request.json().catch(() => ({}))) as {
      isRead?: boolean;
      archive?: boolean;
      snoozedUntil?: string | null;
      remindAt?: string;
    };
    // Design v3: Trash and "needs a reply" change Needt's copy only; mail
    // stays read-only at the provider (owner decision 2026-10-09).
    const v3 = parseV3Fields(mailV3FieldsSchema, body);
    if (!v3.ok) return NextResponse.json({ error: v3.error }, { status: 400 });
    const trashedAt = trashedAtFrom(v3.data.trashed);
    const localOnly = {
      ...(trashedAt !== undefined && { trashedAt }),
      ...(v3.data.needsReply !== undefined && {
        needsReply: v3.data.needsReply,
      }),
    };
    const snoozedUntil =
      body.snoozedUntil === null
        ? null
        : typeof body.snoozedUntil === "string"
          ? newDate(body.snoozedUntil)
          : undefined;
    if (snoozedUntil && Number.isNaN(snoozedUntil.getTime())) {
      return NextResponse.json(
        { error: "Invalid snooze time." },
        { status: 400 }
      );
    }
    const remindAt =
      typeof body.remindAt === "string" ? newDate(body.remindAt) : null;
    if (remindAt && Number.isNaN(remindAt.getTime())) {
      return NextResponse.json(
        { error: "Invalid reminder time." },
        { status: 400 }
      );
    }
    if (
      body.isRead === undefined &&
      !body.archive &&
      snoozedUntil === undefined &&
      !remindAt &&
      Object.keys(localOnly).length === 0
    ) {
      return NextResponse.json(
        { error: "No mail action supplied." },
        { status: 400 }
      );
    }

    if (remindAt) {
      if (
        auth.workspace?.role === WorkspaceRole.VIEWER ||
        !auth.workspace?.workspaceId
      ) {
        return NextResponse.json(
          {
            error: "Workspace Editor access is required to create a reminder.",
          },
          { status: 403 }
        );
      }
      const task = await prisma.task.create({
        data: {
          userId: auth.userId,
          assigneeId: auth.userId,
          workspaceId: auth.workspace.workspaceId,
          title: message.subject || "Follow up on email",
          description: `Created from email: /tasks?view=mail&message=${message.id}`,
          status: "todo",
          startDate: remindAt,
          dueDate: remindAt,
          reminders: {
            create: {
              userId: auth.userId,
              kind: TaskReminderKind.BEFORE_DEADLINE,
              offsetMinutes: 0,
              channels: ["push", "email"],
            },
          },
        },
        select: { id: true, title: true, dueDate: true },
      });
      return NextResponse.json({ reminderTask: task }, { status: 201 });
    }

    const providerAction = {
      ...(body.isRead !== undefined && { isRead: body.isRead }),
      ...(body.archive && { archive: true }),
    };
    if (
      (body.isRead !== undefined || body.archive) &&
      message.account.provider === MailProvider.GMAIL
    ) {
      await mutateGmailMessage(
        message.account,
        message.externalId,
        providerAction
      );
    } else if (
      (body.isRead !== undefined || body.archive) &&
      message.account.provider === MailProvider.OUTLOOK
    ) {
      await mutateOutlookMessage(
        message.account,
        message.externalId,
        providerAction
      );
    } else if (body.isRead !== undefined) {
      await mutateImapMessage(
        message.account,
        message.externalId,
        providerAction
      );
    }
    const updated = await updateMailMessage(auth.userId, id, {
      ...(body.isRead !== undefined && { isRead: body.isRead }),
      ...(body.archive && { isArchived: true }),
      ...(snoozedUntil !== undefined && { snoozedUntil }),
      ...localOnly,
    });
    return NextResponse.json(updated);
  } catch (error) {
    await logger.error(
      "Mail message update failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Could not update this mail message." },
      { status: 502 }
    );
  }
}
