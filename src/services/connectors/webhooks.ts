import { UnsafeFetchError, safeFetch } from "@/services/oauth/safe-fetch";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "connector-webhooks";

type ConnectorWebhookEvent = "schedule.changed" | "task.completed";

export async function sendConnectorWebhook(input: {
  userId: string;
  event: ConnectorWebhookEvent;
  payload: unknown;
}) {
  const settings = await prisma.connectorSettings.findUnique({
    where: { userId: input.userId },
  });

  if (!settings?.webhookUrl) return;
  if (input.event === "schedule.changed" && !settings.webhookSchedule) return;
  if (input.event === "task.completed" && !settings.webhookTaskComplete) return;

  try {
    // The address is whatever the person typed, so it may only reach public
    // hosts; the answer is not used, so it is capped small.
    await safeFetch(
      settings.webhookUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: input.event,
          createdAt: new Date().toISOString(),
          payload: input.payload,
        }),
      },
      { timeoutMs: 10_000, maxBytes: 64 * 1024 }
    );
  } catch (error) {
    // Webhooks are best-effort; scheduling and task completion must not fail.
    if (error instanceof UnsafeFetchError) {
      try {
        await logger.warn(
          "Connector webhook did not complete",
          { userId: input.userId, reason: error.message },
          LOG_SOURCE
        );
      } catch {
        // Logging must not make the webhook fail either.
      }
    }
  }
}
