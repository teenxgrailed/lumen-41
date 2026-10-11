import { NextRequest, NextResponse } from "next/server";

import { encryptSecret } from "@/services/ai/encryption";
import { MailProvider } from "@prisma/client";
import { ImapFlow } from "imapflow";
import { z } from "zod";

import { toPublicMailAccount } from "@/lib/api/public-records";
import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { canAddMailbox } from "@/lib/entitlements";
import { logger } from "@/lib/logger";
import { listMailAccounts } from "@/lib/mail-db";
import { prisma } from "@/lib/prisma";
import { enqueueMailSync, ensureMailSyncSchedule } from "@/lib/queue/enqueue";

const LOG_SOURCE = "MailAccountsAPI";

const imapAccountSchema = z.object({
  address: z.string().email(),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    const accounts = await listMailAccounts(auth.userId);
    return NextResponse.json(accounts.map(toPublicMailAccount));
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to list mail accounts",
      LOG_SOURCE,
      "Could not load mail accounts."
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = imapAccountSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid IMAP account details." },
      { status: 400 }
    );
  }

  const { address, ...credentials } = parsed.data;
  const entitlement = await canAddMailbox(auth.userId, {
    provider: MailProvider.IMAP,
    address,
  });
  if (!entitlement.allowed) {
    return NextResponse.json(
      { error: "Mailbox limit reached.", entitlement },
      { status: 403 }
    );
  }
  const client = new ImapFlow({
    host: credentials.host,
    port: credentials.port,
    secure: credentials.secure,
    auth: { user: credentials.username, pass: credentials.password },
    logger: false,
  });
  try {
    await client.connect();
    await client.logout();
  } catch (error) {
    await logger.warn(
      "IMAP connection test failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Could not connect to this IMAP account." },
      { status: 400 }
    );
  }

  try {
    const account = await prisma.mailAccount.upsert({
      where: {
        userId_provider_address: {
          userId: auth.userId,
          provider: MailProvider.IMAP,
          address,
        },
      },
      update: {
        encryptedCredentials: encryptSecret(JSON.stringify(credentials)),
        status: "ACTIVE",
      },
      create: {
        userId: auth.userId,
        provider: MailProvider.IMAP,
        address,
        encryptedCredentials: encryptSecret(JSON.stringify(credentials)),
      },
    });
    await ensureMailSyncSchedule(account.id);
    await enqueueMailSync(account.id);
    return NextResponse.json(toPublicMailAccount(account), { status: 201 });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to save IMAP account",
      LOG_SOURCE,
      "Could not save this IMAP account."
    );
  }
}
