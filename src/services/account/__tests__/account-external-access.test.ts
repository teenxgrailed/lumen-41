import { composioProvider } from "@/services/integrations/composio-provider";

import { disableGoogleWatch } from "@/lib/calendar-webhooks/google";
import { disableOutlookSubscription } from "@/lib/calendar-webhooks/outlook";
import { prisma } from "@/lib/prisma";
import { TokenManager } from "@/lib/token-manager";

import { revokeExternalAccessForDeletion } from "../account-external-access";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/calendar-webhooks/google", () => ({
  disableGoogleWatch: jest.fn(),
}));
jest.mock("@/lib/calendar-webhooks/outlook", () => ({
  disableOutlookSubscription: jest.fn(),
}));
jest.mock("@/lib/token-manager", () => {
  const getTokens = jest.fn();
  return {
    TokenManager: { getInstance: () => ({ getTokens }) },
  };
});
jest.mock("@/services/integrations/composio-provider", () => ({
  composioProvider: {
    id: "composio",
    isConfigured: jest.fn(),
    deleteUserConnections: jest.fn(),
  },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    calendarWebhook: { findMany: jest.fn(), count: jest.fn() },
    connectedAccount: { findMany: jest.fn(), count: jest.fn() },
    account: { findMany: jest.fn(), count: jest.fn() },
    externalIntegration: { findMany: jest.fn() },
    pushSubscription: { deleteMany: jest.fn() },
  },
}));

const db = prisma as unknown as {
  calendarWebhook: { findMany: jest.Mock; count: jest.Mock };
  connectedAccount: { findMany: jest.Mock; count: jest.Mock };
  account: { findMany: jest.Mock; count: jest.Mock };
  externalIntegration: { findMany: jest.Mock };
  pushSubscription: { deleteMany: jest.Mock };
};
const getTokens = TokenManager.getInstance().getTokens as jest.Mock;
const composio = composioProvider as unknown as {
  isConfigured: jest.Mock;
  deleteUserConnections: jest.Mock;
};

describe("external access revocation on account deletion", () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    db.calendarWebhook.findMany.mockResolvedValue([
      {
        provider: "GOOGLE",
        feedId: "feed-g",
        channelId: "chan-1",
        subscriptionId: null,
      },
      {
        provider: "OUTLOOK",
        feedId: "feed-o",
        channelId: null,
        subscriptionId: "sub-1",
      },
    ]);
    db.calendarWebhook.count.mockResolvedValue(0);
    db.connectedAccount.count.mockResolvedValue(0);
    db.account.count.mockResolvedValue(0);
    db.connectedAccount.findMany.mockResolvedValue([
      { id: "acct-g", email: "person@gmail.com" },
    ]);
    getTokens.mockResolvedValue({
      accessToken: "google-access",
      refreshToken: "google-refresh",
      expiresAt: new Date(0),
    });
    db.account.findMany.mockResolvedValue([
      {
        refresh_token: null,
        access_token: "signin-access",
        user: { email: "person@gmail.com" },
      },
    ]);
    composio.isConfigured.mockReturnValue(true);
    composio.deleteUserConnections.mockResolvedValue({
      deleted: ["ca_1", "ca_2"],
      failed: [],
      kept: [],
    });
    db.externalIntegration.findMany.mockImplementation(async (args) =>
      args.where.NOT ? [] : [{ externalConnectionId: "ca_1" }]
    );
    db.pushSubscription.deleteMany.mockResolvedValue({ count: 2 });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("stops channels, revokes Google, deletes Composio and push access", async () => {
    const report = await revokeExternalAccessForDeletion("user-1");

    expect(disableGoogleWatch).toHaveBeenCalledWith("feed-g", {
      timeoutMs: 10_000,
      stopRemote: true,
    });
    expect(disableOutlookSubscription).toHaveBeenCalledWith("feed-o", {
      timeoutMs: 10_000,
      stopRemote: true,
    });
    expect(db.calendarWebhook.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { feed: { userId: "user-1" } } })
    );

    const revoked = fetchMock.mock.calls.map(([url, init]) => [
      url,
      (init as RequestInit).body,
    ]);
    expect(revoked).toEqual([
      ["https://oauth2.googleapis.com/revoke", "token=google-refresh"],
      ["https://oauth2.googleapis.com/revoke", "token=signin-access"],
    ]);

    expect(composio.deleteUserConnections).toHaveBeenCalledWith(
      "user-1",
      ["ca_1"],
      []
    );
    expect(db.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(report).toEqual({
      webhooksStopped: 2,
      googleGrantsRevoked: 2,
      composioConnectionsDeleted: 2,
      pushSubscriptionsDeleted: 2,
      sharedAccessKept: 0,
      failures: [],
    });
  });

  it("stops channels before it revokes the grant they need", async () => {
    const order: string[] = [];
    jest.mocked(disableGoogleWatch).mockImplementation(async () => {
      order.push("stop");
    });
    fetchMock.mockImplementation(async () => {
      order.push("revoke");
      return { ok: true, status: 200, text: async () => "" };
    });

    await revokeExternalAccessForDeletion("user-1");

    expect(order[0]).toBe("stop");
    expect(order).toContain("revoke");
  });

  it("treats an already-revoked Google grant as done", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":"invalid_token"}',
    });

    const report = await revokeExternalAccessForDeletion("user-1");

    expect(report.googleGrantsRevoked).toBe(2);
    expect(report.failures).toEqual([]);
  });

  it("never throws when every provider fails", async () => {
    jest.mocked(disableGoogleWatch).mockRejectedValue(new Error("google down"));
    jest
      .mocked(disableOutlookSubscription)
      .mockRejectedValue(new Error("graph down"));
    fetchMock.mockRejectedValue(new Error("network"));
    composio.deleteUserConnections.mockRejectedValue(new Error("composio"));
    db.pushSubscription.deleteMany.mockRejectedValue(new Error("db"));

    const report = await revokeExternalAccessForDeletion("user-1");

    expect(report.failures).toEqual([
      "webhook:GOOGLE",
      "webhook:OUTLOOK",
      "google:revoke",
      "google:revoke",
      "composio",
      "push",
    ]);
  });

  it("finds nothing to do on a second run", async () => {
    db.calendarWebhook.findMany.mockResolvedValue([]);
    db.connectedAccount.findMany.mockResolvedValue([]);
    db.account.findMany.mockResolvedValue([]);
    db.externalIntegration.findMany.mockResolvedValue([]);
    composio.deleteUserConnections.mockResolvedValue({
      deleted: [],
      failed: [],
      kept: [],
    });
    db.pushSubscription.deleteMany.mockResolvedValue({ count: 0 });

    const report = await revokeExternalAccessForDeletion("user-1");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(report.failures).toEqual([]);
  });
  it("leaves a Google identity alone when another account uses it", async () => {
    db.connectedAccount.count.mockResolvedValue(1);

    const report = await revokeExternalAccessForDeletion("user-1");

    expect(db.connectedAccount.count).toHaveBeenCalledWith({
      where: {
        provider: "GOOGLE",
        email: { equals: "person@gmail.com", mode: "insensitive" },
        NOT: { userId: "user-1" },
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getTokens).not.toHaveBeenCalled();
    expect(report.googleGrantsRevoked).toBe(0);
    expect(report.sharedAccessKept).toBeGreaterThanOrEqual(2);
  });

  it("drops only the row of a channel another account's feed shares", async () => {
    db.calendarWebhook.count.mockResolvedValue(1);

    await revokeExternalAccessForDeletion("user-1");

    expect(db.calendarWebhook.count).toHaveBeenCalledWith({
      where: {
        feed: { NOT: { userId: "user-1" } },
        OR: [{ channelId: "chan-1" }],
      },
    });
    expect(disableGoogleWatch).toHaveBeenCalledWith("feed-g", {
      timeoutMs: 10_000,
      stopRemote: false,
    });
    expect(disableOutlookSubscription).toHaveBeenCalledWith("feed-o", {
      timeoutMs: 10_000,
      stopRemote: false,
    });
  });

  it("keeps a Composio connection another account references", async () => {
    db.externalIntegration.findMany.mockImplementation(async (args) =>
      args.where.NOT
        ? [{ externalConnectionId: "ca_1" }]
        : [{ externalConnectionId: "ca_1" }]
    );

    await revokeExternalAccessForDeletion("user-1");

    expect(composio.deleteUserConnections).toHaveBeenCalledWith(
      "user-1",
      ["ca_1"],
      ["ca_1"]
    );
  });

  it("returns when the budget runs out, whatever a provider is doing", async () => {
    jest
      .mocked(disableGoogleWatch)
      .mockImplementation(() => new Promise<void>(() => undefined));

    const report = await revokeExternalAccessForDeletion("user-1", 20);

    expect(report.failures).toContain("budget");
    expect(db.pushSubscription.deleteMany).not.toHaveBeenCalled();
    jest.mocked(disableGoogleWatch).mockReset();
  });
});
