import { NextRequest } from "next/server";

import { GET } from "../badge/route";

const authenticateRequest = jest.fn();
jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => authenticateRequest(...args),
}));
const agentHubEnabled = jest.fn();
jest.mock("@/lib/feature-flags", () => ({
  agentHubEnabled: (...args: unknown[]) => agentHubEnabled(...args),
}));
const sweepHub = jest.fn();
jest.mock("@/services/agent-hub/sweep", () => ({
  sweepHub: (...args: unknown[]) => sweepHub(...args),
}));
const unreadCount = jest.fn();
jest.mock("@/services/agent-hub/alerts", () => ({
  unreadCount: (...args: unknown[]) => unreadCount(...args),
}));
jest.mock("@/services/agent-hub/register", () => ({}));

const request = () => new NextRequest("http://localhost/api/agent-hub/badge");

beforeEach(() => {
  jest.clearAllMocks();
  authenticateRequest.mockResolvedValue({
    userId: "user-1",
    workspace: { workspaceId: "ws-1" },
  });
});

describe("GET /api/agent-hub/badge", () => {
  it("tells an account without the flag the Agents item does not exist, and does no hub work", async () => {
    agentHubEnabled.mockResolvedValue(false);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: false, unread: 0 });
    expect(sweepHub).not.toHaveBeenCalled();
    expect(unreadCount).not.toHaveBeenCalled();
  });

  it("returns the unread count for an account with it, after the lazy sweep", async () => {
    agentHubEnabled.mockResolvedValue(true);
    unreadCount.mockResolvedValue(3);
    const response = await GET(request());
    expect(await response.json()).toEqual({ enabled: true, unread: 3 });
    expect(sweepHub).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "ws-1",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers the session's own failure when nobody is signed in", async () => {
    const { NextResponse } = jest.requireActual("next/server");
    authenticateRequest.mockResolvedValue({
      response: new NextResponse("Unauthorized", { status: 401 }),
    });
    expect((await GET(request())).status).toBe(401);
    expect(agentHubEnabled).not.toHaveBeenCalled();
  });
});
