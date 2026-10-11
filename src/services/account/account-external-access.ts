import { composioProvider } from "@/services/integrations/composio-provider";

import { disableGoogleWatch } from "@/lib/calendar-webhooks/google";
import { disableOutlookSubscription } from "@/lib/calendar-webhooks/outlook";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { TokenManager } from "@/lib/token-manager";

const LOG_SOURCE = "AccountExternalAccess";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const REVOKE_TIMEOUT_MS = 10_000;

export interface ExternalAccessRevocationReport {
  webhooksStopped: number;
  googleGrantsRevoked: number;
  composioConnectionsDeleted: number;
  pushSubscriptionsDeleted: number;
  failures: string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Revokes a Google grant. Revoking either token of a grant ends the whole
 * grant, so the refresh token is preferred because it outlives the access
 * token. Google answers 400 `invalid_token` for a grant that is already gone,
 * which is the state we want, so it counts as revoked.
 */
async function revokeGoogleToken(token: string): Promise<boolean> {
  const response = await fetch(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
    signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
  });
  if (response.ok) return true;
  const body = await response.text().catch(() => "");
  if (response.status === 400 && body.includes("invalid_token")) return true;
  throw new Error(`Google revoke returned ${response.status}`);
}

async function stopCalendarWebhooks(
  userId: string,
  report: ExternalAccessRevocationReport
) {
  const webhooks = await prisma.calendarWebhook.findMany({
    where: { feed: { userId } },
    select: { provider: true, feedId: true },
  });
  for (const webhook of webhooks) {
    try {
      if (webhook.provider === "GOOGLE") {
        await disableGoogleWatch(webhook.feedId);
      } else if (webhook.provider === "OUTLOOK") {
        await disableOutlookSubscription(webhook.feedId);
      } else {
        continue;
      }
      report.webhooksStopped += 1;
    } catch (error) {
      report.failures.push(`webhook:${webhook.provider}`);
      await logger.warn(
        "Could not stop calendar webhook before account deletion",
        {
          feedId: webhook.feedId,
          provider: webhook.provider,
          error: errorMessage(error),
        },
        LOG_SOURCE
      );
    }
  }
}

async function revokeGoogleGrants(
  userId: string,
  report: ExternalAccessRevocationReport
) {
  const tokens: string[] = [];
  const connected = await prisma.connectedAccount.findMany({
    where: { userId, provider: "GOOGLE" },
    select: { id: true },
  });
  for (const account of connected) {
    try {
      const stored = await TokenManager.getInstance().getTokens(
        account.id,
        userId
      );
      const token = stored?.refreshToken || stored?.accessToken;
      if (token) tokens.push(token);
    } catch (error) {
      report.failures.push("google:read");
      await logger.warn(
        "Could not read a Google connection for revocation",
        { accountId: account.id, error: errorMessage(error) },
        LOG_SOURCE
      );
    }
  }
  const signIn = await prisma.account.findMany({
    where: { userId, provider: "google" },
    select: { refresh_token: true, access_token: true },
  });
  for (const account of signIn) {
    const token = account.refresh_token || account.access_token;
    if (token) tokens.push(token);
  }

  for (const token of new Set(tokens)) {
    try {
      if (await revokeGoogleToken(token)) report.googleGrantsRevoked += 1;
    } catch (error) {
      report.failures.push("google:revoke");
      await logger.warn(
        "Could not revoke a Google grant before account deletion",
        { error: errorMessage(error) },
        LOG_SOURCE
      );
    }
  }
}

async function deleteComposioConnections(
  userId: string,
  report: ExternalAccessRevocationReport
) {
  const integrations = await prisma.externalIntegration.findMany({
    where: { userId, provider: composioProvider.id },
    select: { externalConnectionId: true },
  });
  const known = integrations.map(
    ({ externalConnectionId }) => externalConnectionId
  );
  if (!composioProvider.isConfigured()) {
    if (known.length > 0) {
      report.failures.push("composio:unconfigured");
      await logger.warn(
        "Composio is not configured; connections were not deleted upstream",
        { connections: known.length },
        LOG_SOURCE
      );
    }
    return;
  }
  const result = await composioProvider.deleteUserConnections(userId, known);
  report.composioConnectionsDeleted += result.deleted.length;
  if (result.failed.length > 0) report.failures.push("composio:delete");
}

/**
 * Cuts every line from third parties back to the account before the account
 * is erased: calendar push channels are stopped while the tokens that stop
 * them still exist, then the Google grant is revoked, Composio connections are
 * deleted upstream, and Web Push endpoints are dropped.
 *
 * Microsoft has no revoke endpoint for consumer-account tokens, and CalDAV
 * has nothing to revoke, so for both the stored credentials are the access;
 * the deletion transaction removes them with the connected accounts.
 *
 * Every step is best-effort: a provider that is down, or a grant the person
 * already revoked, is logged and never holds the deletion up. Running it twice
 * is harmless, because each step either finds nothing left or meets a
 * provider answer that means "already gone".
 */
export async function revokeExternalAccessForDeletion(
  userId: string
): Promise<ExternalAccessRevocationReport> {
  const report: ExternalAccessRevocationReport = {
    webhooksStopped: 0,
    googleGrantsRevoked: 0,
    composioConnectionsDeleted: 0,
    pushSubscriptionsDeleted: 0,
    failures: [],
  };
  const steps: [string, () => Promise<void>][] = [
    ["webhooks", () => stopCalendarWebhooks(userId, report)],
    ["google", () => revokeGoogleGrants(userId, report)],
    ["composio", () => deleteComposioConnections(userId, report)],
    [
      "push",
      async () => {
        const removed = await prisma.pushSubscription.deleteMany({
          where: { userId },
        });
        report.pushSubscriptionsDeleted += removed.count;
      },
    ],
  ];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (error) {
      report.failures.push(name);
      await logger.warn(
        "External access revocation step failed",
        { step: name, error: errorMessage(error) },
        LOG_SOURCE
      );
    }
  }
  await logger.info(
    "External access revoked before account deletion",
    {
      webhooksStopped: report.webhooksStopped,
      googleGrantsRevoked: report.googleGrantsRevoked,
      composioConnectionsDeleted: report.composioConnectionsDeleted,
      pushSubscriptionsDeleted: report.pushSubscriptionsDeleted,
      failures: report.failures,
    },
    LOG_SOURCE
  );
  return report;
}
