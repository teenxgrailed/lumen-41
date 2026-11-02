import { NextRequest, NextResponse } from "next/server";

import { revokeGoogleConnectionOnDisconnect } from "@/services/account/account-external-access";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { removeMailSyncSchedule } from "@/lib/queue/enqueue";

const LOG_SOURCE = "MailAccountAPI";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    const { id } = await params;
    const account = await prisma.mailAccount.findFirst({
      where: { id, userId: auth.userId },
    });
    if (!account) {
      return NextResponse.json(
        { error: "Mail account not found." },
        { status: 404 }
      );
    }
    const connectionRef = account.connectionRef;
    /* The OAuth connection can be shared with a calendar, another mailbox or
       a task provider of the same Google identity. Only an unshared one is
       revoked at Google and deleted; a shared one stays for its other users. */
    let connectionUnshared = false;
    if (connectionRef) {
      const [calendars, otherMailboxes, taskProviders] = await Promise.all([
        prisma.calendarFeed.count({ where: { accountId: connectionRef } }),
        prisma.mailAccount.count({
          where: { connectionRef, NOT: { id } },
        }),
        prisma.taskProvider.count({ where: { accountId: connectionRef } }),
      ]);
      connectionUnshared =
        calendars === 0 && otherMailboxes === 0 && taskProviders === 0;
    }
    if (connectionRef && connectionUnshared && account.provider === "GMAIL") {
      /* Never throws and is time-bounded: a Google outage cannot block the
         disconnect. Needs the stored tokens, so it runs before they go. */
      await revokeGoogleConnectionOnDisconnect(auth.userId, connectionRef);
    }
    /* MailMessage rows are kept (the privacy policy says so); credentials and
       tokens are not. */
    await prisma.mailAccount.update({
      where: { id },
      data: {
        status: "DISCONNECTED",
        encryptedCredentials: null,
        connectionRef: null,
      },
    });
    if (connectionRef && connectionUnshared) {
      await prisma.connectedAccount
        .deleteMany({ where: { id: connectionRef, userId: auth.userId } })
        .catch(async (error: unknown) => {
          await logger.warn(
            "Could not delete the mail OAuth connection after disconnect",
            {
              accountId: id,
              error: error instanceof Error ? error.message : String(error),
            },
            LOG_SOURCE
          );
        });
    }
    await removeMailSyncSchedule(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to disconnect mail account",
      LOG_SOURCE,
      "Could not disconnect this mail account."
    );
  }
}
