import { deliverPush } from "@/services/reminders/reminder-delivery";

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
jest.mock("@block65/webcrypto-web-push", () => ({
  buildPushPayload: jest
    .fn()
    .mockResolvedValue({ method: "POST", headers: {}, body: "x" }),
}));

describe("deliverPush endpoint safety", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    process.env.VAPID_SUBJECT = "mailto:push@example.com";
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public-key";
    process.env.VAPID_PRIVATE_KEY = "private-key";
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
  });

  it("does not deliver to an endpoint that is a private address", async () => {
    // An IP literal needs no DNS: this is what a rebound name resolves to.
    const result = await deliverPush(
      {
        id: "p1",
        endpoint: "https://127.0.0.1/push",
        p256dh: "p",
        auth: "a",
      },
      { title: "t", body: "b", url: "/" }
    );
    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
