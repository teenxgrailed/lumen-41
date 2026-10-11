import { composioProvider } from "@/services/integrations/composio-provider";

import { disableGoogleWatch } from "@/lib/calendar-webhooks/google";
import { disableOutlookSubscription } from "@/lib/calendar-webhooks/outlook";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { TokenManager } from "@/lib/token-manager";

const LOG_SOURCE = "AccountExternalAccess";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const PROVIDER_TIMEOUT_MS = 10_000;
export const EXTERNAL_REVOCATION_BUDGET_MS = 60_000;

export interface ExternalAccessRevocationReport {
  webhooksStopped: number;
  googleGrantsRevoked: number;
  composioConnectionsDeleted: number;
  pushSubscriptionsDeleted: number;
  /** Channels, grants and connections left alone because another account uses them. */
  sharedAccessKept: number;
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
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
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
    select: {
      provider: true,
      feedId: true,
      channelId: true,
      subscriptionId: true,
    },
  });
  for (const webhook of webhooks) {
    try {
      /* A channel or subscription id that another account's feed also
         points at is not this account's to stop: only our row goes. */
      const sharedIds = [webhook.channelId, webhook.subscriptionId].filter(
        (id): id is string => Boolean(id)
      );
      const shared =
        sharedIds.length > 0 &&
        (await prisma.calendarWebhook.count({
          where: {
            feed: { NOT: { userId } },
            OR: [
              ...(webhook.channelId ? [{ channelId: webhook.channelId }] : []),
              ...(webhook.subscriptionId
                ? [{ subscriptionId: webhook.subscriptionId }]
                : []),
            ],
          },
        })) > 0;
      const options = {
        timeoutMs: PROVIDER_TIMEOUT_MS,
        stopRemote: !shared,
      };
      if (webhook.provider === "GOOGLE") {
        await disableGoogleWatch(webhook.feedId, options);
      } else if (webhook.provider === "OUTLOOK") {
        await disableOutlookSubscription(webhook.feedId, options);
      } else {
        continue;
      }
      if (shared) report.sharedAccessKept += 1;
      else report.webhooksStopped += 1;
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

/**
 * Google revokes a grant for the Google identity and our OAuth client
 * together, not for one Needt account. When another Needt account holds the
 * same Google identity (a shared calendar, an owner's test accounts), a revoke
 * here would cut that account off too, so it is skipped and only this
 * account's rows are deleted.
 */
async function googleIdentityUsedElsewhere(
  userId: string,
  email: string | null
): Promise<boolean> {
  if (!email) return false;
  const insensitive = { equals: email, mode: "insensitive" as const };
  const [connected, signIn] = await Promise.all([
    prisma.connectedAccount.count({
      where: { provider: "GOOGLE", email: insensitive, NOT: { userId } },
    }),
    prisma.account.count({
      where: {
        provider: "google",
        NOT: { userId },
        user: { email: insensitive },
      },
    }),
  ]);
  return connected + signIn > 0;
}

async function revokeGoogleGrants(
  userId: string,
  report: ExternalAccessRevocationReport
) {
  const tokens: string[] = [];
  const connected = await prisma.connectedAccount.findMany({
    where: { userId, provider: "GOOGLE" },
    select: { id: true, email: true },
  });
  for (const account of connected) {
    try {
      if (await googleIdentityUsedElsewhere(userId, account.email)) {
        report.sharedAccessKept += 1;
        continue;
      }
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
    select: {
      refresh_token: true,
      access_token: true,
      user: { select: { email: true } },
    },
  });
  for (const account of signIn) {
    if (await googleIdentityUsedElsewhere(userId, account.user.email)) {
      report.sharedAccessKept += 1;
      continue;
    }
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
  const referencedElsewhere =
    known.length > 0
      ? await prisma.externalIntegration.findMany({
          where: {
            provider: composioProvider.id,
            externalConnectionId: { in: known },
            NOT: { userId },
          },
          select: { externalConnectionId: true },
        })
      : [];
  const result = await composioProvider.deleteUserConnections(
    userId,
    known,
    referencedElsewhere.map(({ externalConnectionId }) => externalConnectionId)
  );
  report.composioConnectionsDeleted += result.deleted.length;
  report.sharedAccessKept += result.kept.length;
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
  userId: string,
  budgetMs = EXTERNAL_REVOCATION_BUDGET_MS
): Promise<ExternalAccessRevocationReport> {
  const report: ExternalAccessRevocationReport = {
    webhooksStopped: 0,
    googleGrantsRevoked: 0,
    composioConnectionsDeleted: 0,
    pushSubscriptionsDeleted: 0,
    sharedAccessKept: 0,
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
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const runSteps = async () => {
    for (const [name, step] of steps) {
      if (timedOut) return;
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
  };
  /* Each provider call has its own timeout; the budget bounds the whole run,
     so a provider that hangs past it cannot hold the deletion sweep. A step
     still running when the budget ends finishes in the background and its
     results are not reported. */
  await Promise.race([
    runSteps(),
    new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        report.failures.push("budget");
        resolve();
      }, budgetMs);
    }),
  ]);
  clearTimeout(timer);
  await logger.info(
    "External access revoked before account deletion",
    {
      webhooksStopped: report.webhooksStopped,
      googleGrantsRevoked: report.googleGrantsRevoked,
      composioConnectionsDeleted: report.composioConnectionsDeleted,
      pushSubscriptionsDeleted: report.pushSubscriptionsDeleted,
      sharedAccessKept: report.sharedAccessKept,
      failures: report.failures,
    },
    LOG_SOURCE
  );
  return report;
}
