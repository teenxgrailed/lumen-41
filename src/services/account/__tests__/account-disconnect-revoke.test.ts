import { disableGoogleWatch } from "@/lib/calendar-webhooks/google";
import { prisma } from "@/lib/prisma";
import { TokenManager } from "@/lib/token-manager";

import { revokeGoogleConnectionOnDisconnect } from "../account-external-access";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/calendar-webhooks/google", () => ({
  disableGoogleWatch: jest.fn(),
}));
jest.mock("@/lib/calendar-webhooks/outlook", () => ({
  disableOutlookSubscription: jest.fn(),
}));
jest.mock("@/services/integrations/composio-provider", () => ({
  composioProvider: {},
}));
jest.mock("@/lib/token-manager", () => {
  const getTokens = jest.fn();
  return { TokenManager: { getInstance: () => ({ getTokens }) } };
});
jest.mock("@/lib/prisma", () => ({
  prisma: {
    calendarWebhook: { findMany: jest.fn(), count: jest.fn() },
    connectedAccount: { findFirst: jest.fn(), count: jest.fn() },
    account: { count: jest.fn() },
  },
}));

const db = prisma as unknown as {
  calendarWebhook: { findMany: jest.Mock; count: jest.Mock };
  connectedAccount: { findFirst: jest.Mock; count: jest.Mock };
  account: { count: jest.Mock };
};
const getTokens = TokenManager.getInstance().getTokens as jest.Mock;

describe("Google revoke on disconnect", () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    db.connectedAccount.findFirst.mockResolvedValue({
      id: "acct-1",
      provider: "GOOGLE",
      email: "person@gmail.com",
    });
    db.connectedAccount.count.mockResolvedValue(0);
    db.account.count.mockResolvedValue(0);
    db.calendarWebhook.findMany.mockResolvedValue([
      {
        provider: "GOOGLE",
        feedId: "feed-1",
        channelId: "chan-1",
        subscriptionId: null,
      },
    ]);
    db.calendarWebhook.count.mockResolvedValue(0);
    getTokens.mockResolvedValue({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: new Date(0),
    });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("stops this account's channels, then revokes the refresh token", async () => {
    const report = await revokeGoogleConnectionOnDisconnect("u1", "acct-1", {
      stopWebhooks: true,
    });

    expect(db.calendarWebhook.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { feed: { userId: "u1", accountId: "acct-1" } },
      })
    );
    expect(disableGoogleWatch).toHaveBeenCalledWith("feed-1", {
      timeoutMs: 10_000,
      stopRemote: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBe(
      "token=refresh"
    );
    expect(report).toMatchObject({
      webhooksStopped: 1,
      revoked: true,
      grantKept: false,
      failures: [],
    });
  });

  it("does not touch channels unless asked (mailbox disconnect)", async () => {
    await revokeGoogleConnectionOnDisconnect("u1", "acct-1");
    expect(db.calendarWebhook.findMany).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("counts invalid_token as already revoked", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":"invalid_token"}',
    });
    const report = await revokeGoogleConnectionOnDisconnect("u1", "acct-1");
    expect(report.revoked).toBe(true);
    expect(report.failures).toEqual([]);
  });

  it("keeps the grant when another Needt account holds the same identity", async () => {
    db.connectedAccount.count
      .mockResolvedValueOnce(0) // same user, other connection
      .mockResolvedValueOnce(1); // another user
    const report = await revokeGoogleConnectionOnDisconnect("u1", "acct-1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(report.grantKept).toBe(true);
    expect(report.revoked).toBe(false);
  });

  it("keeps the grant when this user has another connection with the identity", async () => {
    db.connectedAccount.count.mockResolvedValueOnce(1);
    const report = await revokeGoogleConnectionOnDisconnect("u1", "acct-1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(report.grantKept).toBe(true);
  });

  it("ignores accounts that are not Google", async () => {
    db.connectedAccount.findFirst.mockResolvedValue({
      id: "acct-1",
      provider: "OUTLOOK",
      email: "p@outlook.com",
    });
    await revokeGoogleConnectionOnDisconnect("u1", "acct-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws when Google is down", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    const report = await revokeGoogleConnectionOnDisconnect("u1", "acct-1");
    expect(report.revoked).toBe(false);
    expect(report.failures).toContain("google:revoke");
  });

  it("never throws when the database fails", async () => {
    db.connectedAccount.findFirst.mockRejectedValue(new Error("db"));
    await expect(
      revokeGoogleConnectionOnDisconnect("u1", "acct-1")
    ).resolves.toMatchObject({ revoked: false });
  });

  it("returns within its budget when Google hangs", async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const report = await revokeGoogleConnectionOnDisconnect("u1", "acct-1", {
      budgetMs: 20,
    });
    expect(report.failures).toContain("budget");
  });
});
