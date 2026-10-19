import { deliverPush } from "@/services/reminders/reminder-delivery";

import { prisma } from "@/lib/prisma";

jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn().mockResolvedValue(undefined),
    error: jest.fn(),
  },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: { pushSubscription: { deleteMany: jest.fn() } },
}));
jest.mock("@/lib/email/email-service", () => ({
  EmailService: { sendEmail: jest.fn() },
}));
const mockBuild = jest.fn();
jest.mock("@block65/webcrypto-web-push", () => ({
  buildPushPayload: (...args: unknown[]) => mockBuild(...args),
}));

const saved = {
  subject: process.env.VAPID_SUBJECT,
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
};
function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

const subscription = {
  id: "push-1",
  endpoint: "https://push.example.test/subscription",
  p256dh: "p256dh",
  auth: "auth",
};
const payload = { title: "Needt", body: "Hello", url: "/today" };
const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  process.env.VAPID_SUBJECT = "mailto:push@example.com";
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public-key";
  process.env.VAPID_PRIVATE_KEY = "private-key";
  mockBuild.mockResolvedValue({ method: "POST", headers: {}, body: "x" });
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  restore("VAPID_SUBJECT", saved.subject);
  restore("NEXT_PUBLIC_VAPID_PUBLIC_KEY", saved.publicKey);
  restore("VAPID_PRIVATE_KEY", saved.privateKey);
});

describe("deliverPush", () => {
  it("signs with the VAPID pair and posts to the subscription endpoint", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201 });
    await expect(deliverPush(subscription, payload)).resolves.toBe(true);
    expect(mockBuild).toHaveBeenCalledWith(
      expect.objectContaining({ data: payload }),
      expect.objectContaining({
        endpoint: subscription.endpoint,
        keys: { p256dh: "p256dh", auth: "auth" },
      }),
      {
        subject: "mailto:push@example.com",
        publicKey: "public-key",
        privateKey: "private-key",
      }
    );
    expect(fetchMock).toHaveBeenCalledWith(
      subscription.endpoint,
      expect.objectContaining({ method: "POST" })
    );
  });

  it.each([404, 410])("deletes the subscription on %s", async (status) => {
    fetchMock.mockResolvedValue({ ok: false, status });
    await expect(deliverPush(subscription, payload)).resolves.toBe(false);
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { id: "push-1" },
    });
  });

  it("keeps the subscription and throws on other provider errors", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    await expect(deliverPush(subscription, payload)).rejects.toThrow(
      "Push provider returned 403"
    );
    expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalled();
  });
});
