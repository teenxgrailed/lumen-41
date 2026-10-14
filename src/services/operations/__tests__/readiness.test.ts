import { collectServiceReadiness } from "@/services/operations/readiness";

import { getGoogleCredentials, getOutlookCredentials } from "@/lib/auth";
import { getRedisConnection } from "@/lib/queue/connection";

jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@sentry/node", () => ({ captureMessage: jest.fn() }));
jest.mock("@/lib/email/email-service", () => {
  const actual = jest.requireActual("@/lib/email/email-service");
  return { EmailService: { formatSender: actual.EmailService.formatSender } };
});
jest.mock("@/lib/auth", () => ({
  getGoogleCredentials: jest.fn(),
  getOutlookCredentials: jest.fn(),
}));
jest.mock("@/lib/queue/connection", () => ({
  getRedisConnection: jest.fn(),
}));
jest.mock("@/lib/queue/queues", () => ({}));

const SECRETS = {
  CREEM_API_KEY: "creem_secret_value_123",
  CREEM_WEBHOOK_SECRET: "whsec_secret_value_456",
  CREEM_PRODUCT_PRO_MONTHLY: "prod_monthly_789",
  CREEM_PRODUCT_PRO_YEARLY: "prod_yearly_789",
  CREEM_PRODUCT_LIFETIME: "prod_lifetime_789",
  RESEND_API_KEY: "re_secret_value_abc",
  RESEND_FROM_EMAIL: "sender-secret@needt.app",
  NEEDT_ALERT_EMAIL: "owner-secret@needt.app",
  VAPID_SUBJECT: "mailto:vapid-secret@needt.app",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "vapid_public_secret_def",
  VAPID_PRIVATE_KEY: "vapid_private_secret_ghi",
  NEEDT_AI_API_KEY: "sk-or-secret-value-jkl",
  SENTRY_DSN: "https://dsnsecretkey@o1.ingest.sentry.io/1",
  NEXT_PUBLIC_SENTRY_DSN: "https://publicdsnsecret@o1.ingest.sentry.io/2",
  COLLABORATION_PUBLIC_URL: "wss://collab.example.test/socket",
  REDIS_URL: "redis://:redispasswordsecret@redis:6379",
  WEBHOOK_BASE_URL: "https://hooks.example.test",
  CRON_SECRET: "cron_secret_value_mno",
};
const GOOGLE_SECRET = "google_client_secret_pqr";
const OUTLOOK_SECRET = "outlook_client_secret_stu";

const originalEnv = process.env;
const redis = { ping: jest.fn() };
const fetchMock = jest.fn();

function byService(
  result: Awaited<ReturnType<typeof collectServiceReadiness>>,
  service: string
) {
  const entry = result.find((item) => item.service === service);
  if (!entry) throw new Error(`missing ${service}`);
  return entry;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...originalEnv };
  for (const name of [
    ...Object.keys(SECRETS),
    "NEXT_PUBLIC_COLLABORATION_URL",
    "NEXTAUTH_URL",
  ]) {
    delete process.env[name];
  }
  (getGoogleCredentials as jest.Mock).mockResolvedValue({
    clientId: "",
    clientSecret: "",
  });
  (getOutlookCredentials as jest.Mock).mockResolvedValue({
    clientId: "",
    clientSecret: "",
    tenantId: "common",
  });
  (getRedisConnection as jest.Mock).mockReturnValue(redis);
  redis.ping.mockResolvedValue("PONG");
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  process.env = originalEnv;
});

function configureEverything() {
  Object.assign(process.env, SECRETS);
  (getGoogleCredentials as jest.Mock).mockResolvedValue({
    clientId: "google-id",
    clientSecret: GOOGLE_SECRET,
  });
  (getOutlookCredentials as jest.Mock).mockResolvedValue({
    clientId: "outlook-id",
    clientSecret: OUTLOOK_SECRET,
    tenantId: "common",
  });
}

describe("collectServiceReadiness", () => {
  it("reports every service unconfigured when nothing is set", async () => {
    const result = await collectServiceReadiness();
    for (const service of [
      "Creem billing",
      "Resend email",
      "Owner alert email",
      "Web push (VAPID)",
      "Google OAuth",
      "Microsoft OAuth",
      "Hosted AI",
      "Sentry",
      "Collaboration server",
      "Redis queue",
      "Calendar webhook base URL",
      "Cron secret",
    ]) {
      expect(byService(result, service).configured).toBe(false);
    }
    expect(redis.ping).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports every service configured and alive when set", async () => {
    configureEverything();
    const result = await collectServiceReadiness();
    expect(result.every((entry) => entry.configured)).toBe(true);
    expect(byService(result, "Redis queue").healthy).toBe(true);
    expect(byService(result, "Collaboration server").healthy).toBe(true);
    expect(byService(result, "Hosted AI").detail).toContain("openrouter.ai");
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://collab.example.test/health"
    );
  });

  it("names what is missing without failing the whole check", async () => {
    process.env.SENTRY_DSN = SECRETS.SENTRY_DSN;
    process.env.VAPID_PRIVATE_KEY = SECRETS.VAPID_PRIVATE_KEY;
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    const result = await collectServiceReadiness();
    expect(byService(result, "Sentry")).toMatchObject({
      configured: true,
      detail: expect.stringContaining("NEXT_PUBLIC_SENTRY_DSN"),
    });
    expect(byService(result, "Web push (VAPID)").detail).toContain(
      "VAPID_SUBJECT"
    );
    expect(byService(result, "Calendar webhook base URL")).toMatchObject({
      configured: true,
      detail: expect.stringContaining("https"),
    });
  });

  it("turns a failed probe into healthy:false instead of throwing", async () => {
    configureEverything();
    redis.ping.mockRejectedValue(new Error("ECONNREFUSED redispasswordsecret"));
    fetchMock.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    (getGoogleCredentials as jest.Mock).mockRejectedValue(new Error("db down"));

    const result = await collectServiceReadiness();
    expect(byService(result, "Redis queue")).toMatchObject({
      configured: true,
      healthy: false,
      detail: "Ping unreachable",
    });
    expect(byService(result, "Collaboration server")).toMatchObject({
      configured: true,
      healthy: false,
    });
    expect(byService(result, "OAuth")).toMatchObject({ healthy: false });
  });

  it("gives up on a Redis ping that never answers", async () => {
    jest.useFakeTimers();
    try {
      configureEverything();
      redis.ping.mockReturnValue(new Promise(() => undefined));
      const pending = collectServiceReadiness();
      await jest.advanceTimersByTimeAsync(1_100);
      const result = await pending;
      expect(byService(result, "Redis queue")).toMatchObject({
        healthy: false,
        detail: "Ping timed out",
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("reports an unhealthy collaboration answer", async () => {
    configureEverything();
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const result = await collectServiceReadiness();
    expect(byService(result, "Collaboration server")).toMatchObject({
      healthy: false,
      detail: "Health check answered 503",
    });
  });

  it("never returns a secret value", async () => {
    configureEverything();
    const serialized = JSON.stringify(await collectServiceReadiness());
    for (const value of [
      ...Object.entries(SECRETS)
        .filter(
          ([name]) =>
            name !== "COLLABORATION_PUBLIC_URL" && name !== "WEBHOOK_BASE_URL"
        )
        .map(([, value]) => value),
      GOOGLE_SECRET,
      OUTLOOK_SECRET,
      "redispasswordsecret",
    ]) {
      expect(serialized).not.toContain(value);
    }

    redis.ping.mockRejectedValue(new Error("auth failed redispasswordsecret"));
    const failed = JSON.stringify(await collectServiceReadiness());
    expect(failed).not.toContain("redispasswordsecret");
  });
});
