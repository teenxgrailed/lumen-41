import { HOSTED_AI_CONFIG } from "@/services/ai/usage";
import { alertRecipient } from "@/services/operations/alerts";

import { getGoogleCredentials, getOutlookCredentials } from "@/lib/auth";
import { getWebhookBaseUrl } from "@/lib/calendar-webhooks/config";
import {
  getCreemProductIds,
  isCreemClientConfigured,
  isCreemConfigured,
  isCreemWebhookConfigured,
} from "@/lib/creem/config";
import { EmailService } from "@/lib/email/email-service";
import { logger } from "@/lib/logger";
import { getVapidConfiguration } from "@/lib/push-config";
import { getRedisConnection } from "@/lib/queue/connection";
import { isQueueConfigured } from "@/lib/queue/enqueue";

const LOG_SOURCE = "ServiceReadiness";

const REDIS_TIMEOUT_MS = 1_000;
const COLLABORATION_TIMEOUT_MS = 2_000;

/**
 * Whether one external service is set up and, where it can be asked cheaply,
 * whether it answers. Booleans and short reasons only: a value read from the
 * environment or from system settings never appears here, because this goes
 * to a browser.
 */
export type ServiceReadiness = {
  service: string;
  configured: boolean;
  healthy?: boolean;
  detail?: string;
};

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function reasonOf(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") {
    return "timed out";
  }
  if (error instanceof Error && error.message === "timeout") {
    return "timed out";
  }
  return "unreachable";
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function detectCreem(): ServiceReadiness {
  const products = getCreemProductIds();
  const missing = [
    !isCreemClientConfigured() && "API key",
    !isCreemWebhookConfigured() && "webhook secret",
    !products.proMonthly && "Pro monthly product",
    !products.proYearly && "Pro yearly product",
    !products.lifetime && "Lifetime product",
  ].filter(Boolean);
  return {
    service: "Creem billing",
    configured: isCreemConfigured(),
    detail: missing.length > 0 ? `Missing: ${missing.join(", ")}` : undefined,
  };
}

function detectEmail(): ServiceReadiness {
  if (!hasEnv("RESEND_API_KEY")) {
    return {
      service: "Resend email",
      configured: false,
      detail: "RESEND_API_KEY is not set",
    };
  }
  if (!hasEnv("RESEND_FROM_EMAIL")) {
    return {
      service: "Resend email",
      configured: false,
      detail: "RESEND_FROM_EMAIL is not set",
    };
  }
  try {
    EmailService.formatSender("Needt");
  } catch {
    return {
      service: "Resend email",
      configured: false,
      detail: "RESEND_FROM_EMAIL is not one valid mailbox",
    };
  }
  return { service: "Resend email", configured: true };
}

function detectAlertEmail(): ServiceReadiness {
  return {
    service: "Owner alert email",
    configured: Boolean(alertRecipient()),
    detail: alertRecipient()
      ? undefined
      : "NEEDT_ALERT_EMAIL is not set; critical alerts reach Sentry only",
  };
}

function detectPush(): ServiceReadiness {
  const vapid = getVapidConfiguration();
  return {
    service: "Web push (VAPID)",
    configured: vapid.configured,
    detail: vapid.configured
      ? undefined
      : `Missing: ${vapid.missingVariables.join(", ")}`,
  };
}

async function detectOAuth(): Promise<ServiceReadiness[]> {
  const [google, outlook] = await Promise.all([
    getGoogleCredentials(),
    getOutlookCredentials(),
  ]);
  return [
    {
      service: "Google OAuth",
      configured: Boolean(google.clientId && google.clientSecret),
    },
    {
      service: "Microsoft OAuth",
      configured: Boolean(outlook.clientId && outlook.clientSecret),
    },
  ];
}

function detectHostedAi(): ServiceReadiness {
  const configured = hasEnv("NEEDT_AI_API_KEY");
  let gateway = "custom gateway";
  try {
    gateway = new URL(HOSTED_AI_CONFIG.baseUrl).hostname;
  } catch {
    gateway = "invalid NEEDT_AI_BASE_URL";
  }
  return {
    service: "Hosted AI",
    configured,
    detail: configured
      ? `${HOSTED_AI_CONFIG.model} via ${gateway}`
      : "NEEDT_AI_API_KEY is not set; only own keys work",
  };
}

function detectSentry(): ServiceReadiness {
  const server = hasEnv("SENTRY_DSN");
  const client = hasEnv("NEXT_PUBLIC_SENTRY_DSN");
  return {
    service: "Sentry",
    configured: server,
    detail:
      server && client
        ? undefined
        : server
          ? "Browser DSN (NEXT_PUBLIC_SENTRY_DSN) is not set"
          : client
            ? "Server DSN (SENTRY_DSN) is not set"
            : "SENTRY_DSN is not set",
  };
}

function collaborationUrl(): string | null {
  return (
    process.env.COLLABORATION_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_COLLABORATION_URL?.trim() ||
    null
  );
}

async function detectCollaboration(): Promise<ServiceReadiness> {
  const service = "Collaboration server";
  const raw = collaborationUrl();
  if (!raw) {
    return { service, configured: false, detail: "No collaboration URL set" };
  }
  let healthUrl: URL;
  try {
    healthUrl = new URL(raw);
    healthUrl.protocol =
      healthUrl.protocol === "wss:" || healthUrl.protocol === "https:"
        ? "https:"
        : "http:";
    healthUrl.pathname = "/health";
    healthUrl.search = "";
  } catch {
    return {
      service,
      configured: true,
      healthy: false,
      detail: "Collaboration URL is not a valid URL",
    };
  }
  try {
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(COLLABORATION_TIMEOUT_MS),
      cache: "no-store",
    });
    return response.ok
      ? { service, configured: true, healthy: true }
      : {
          service,
          configured: true,
          healthy: false,
          detail: `Health check answered ${response.status}`,
        };
  } catch (error) {
    return {
      service,
      configured: true,
      healthy: false,
      detail: `Health check ${reasonOf(error)}`,
    };
  }
}

async function detectRedis(): Promise<ServiceReadiness> {
  const service = "Redis queue";
  if (!isQueueConfigured()) {
    return { service, configured: false, detail: "REDIS_URL is not set" };
  }
  try {
    const reply = await withTimeout(
      getRedisConnection().ping(),
      REDIS_TIMEOUT_MS
    );
    return reply === "PONG"
      ? { service, configured: true, healthy: true }
      : {
          service,
          configured: true,
          healthy: false,
          detail: "Unexpected ping reply",
        };
  } catch (error) {
    return {
      service,
      configured: true,
      healthy: false,
      detail: `Ping ${reasonOf(error)}`,
    };
  }
}

function detectWebhookBaseUrl(): ServiceReadiness {
  const service = "Calendar webhook base URL";
  try {
    const url = new URL(getWebhookBaseUrl());
    const source = hasEnv("WEBHOOK_BASE_URL")
      ? "WEBHOOK_BASE_URL"
      : "NEXTAUTH_URL fallback";
    return {
      service,
      configured: true,
      detail:
        url.protocol === "https:"
          ? source
          : `${source}; providers require https`,
    };
  } catch {
    return {
      service,
      configured: false,
      detail: "Neither WEBHOOK_BASE_URL nor NEXTAUTH_URL is a valid URL",
    };
  }
}

function detectCronSecret(): ServiceReadiness {
  const configured = hasEnv("CRON_SECRET");
  return {
    service: "Cron secret",
    configured,
    detail: configured ? undefined : "Cron endpoints refuse every call",
  };
}

async function guarded(
  service: string,
  detect: () =>
    | ServiceReadiness
    | Promise<ServiceReadiness | ServiceReadiness[]>
): Promise<ServiceReadiness[]> {
  try {
    const result = await detect();
    return Array.isArray(result) ? result : [result];
  } catch (error) {
    void logger.warn(
      "Service readiness check failed",
      {
        service,
        error: error instanceof Error ? error.name : "UnknownError",
      },
      LOG_SOURCE
    );
    return [
      {
        service,
        configured: false,
        healthy: false,
        detail: "Check failed",
      },
    ];
  }
}

/**
 * Answer "which external services are configured and alive" in one call.
 * Every probe is bounded and never throws; a failure becomes healthy:false.
 */
export async function collectServiceReadiness(): Promise<ServiceReadiness[]> {
  const groups = await Promise.all([
    guarded("Creem billing", detectCreem),
    guarded("Resend email", detectEmail),
    guarded("Owner alert email", detectAlertEmail),
    guarded("Web push (VAPID)", detectPush),
    guarded("OAuth", detectOAuth),
    guarded("Hosted AI", detectHostedAi),
    guarded("Sentry", detectSentry),
    guarded("Collaboration server", detectCollaboration),
    guarded("Redis queue", detectRedis),
    guarded("Calendar webhook base URL", detectWebhookBaseUrl),
    guarded("Cron secret", detectCronSecret),
  ]);
  return groups.flat();
}
