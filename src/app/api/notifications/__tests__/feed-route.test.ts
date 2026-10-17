import { NextRequest } from "next/server";

import { POST as connectRead } from "@/app/api/connect/notifications/read/route";
import { GET as connectGet } from "@/app/api/connect/notifications/route";
import { POST as readPost } from "@/app/api/notifications/read/route";
import { GET } from "@/app/api/notifications/route";
import { authenticateConnectorRequest } from "@/services/connectors/auth";
import {
  NotificationReadError,
  getNotificationFeed,
  markNotificationsRead,
} from "@/services/notifications/feed";

import { authenticateRequest } from "@/lib/auth/api-auth";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/services/connectors/auth", () => ({
  authenticateConnectorRequest: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock("@/services/notifications/feed", () => ({
  ...jest.requireActual("@/services/notifications/feed"),
  getNotificationFeed: jest.fn(),
  markNotificationsRead: jest.fn(),
}));

const session = jest.mocked(authenticateRequest);
const connector = jest.mocked(authenticateConnectorRequest);
const feed = jest.mocked(getNotificationFeed);
const mark = jest.mocked(markNotificationsRead);
const workspace = { workspaceId: "w1" } as never;
const denied = (status: number) =>
  ({ response: new Response("no", { status }) }) as never;

const get = (url: string) => new NextRequest(`http://localhost${url}`);
const post = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  session.mockResolvedValue({ userId: "u1", workspace } as never);
  connector.mockResolvedValue({ userId: "u1", workspace } as never);
  feed.mockResolvedValue({ items: [], nextBefore: null, unreadCount: 0 });
});

describe("GET /api/notifications?feed=1", () => {
  it("is 401 without a session", async () => {
    session.mockResolvedValue(denied(401));
    const res = await GET(get("/api/notifications?feed=1"));
    expect(res.status).toBe(401);
    expect(feed).not.toHaveBeenCalled();
  });

  it("returns the feed for the caller and workspace, with the defaults", async () => {
    const res = await GET(get("/api/notifications?feed=1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [],
      nextBefore: null,
      unreadCount: 0,
    });
    expect(feed).toHaveBeenCalledWith({
      userId: "u1",
      workspace,
      group: "activity",
      limit: undefined,
      before: null,
    });
  });

  it("passes group, limit and before", async () => {
    await GET(
      get(
        "/api/notifications?feed=1&group=reminders&limit=5&before=2026-10-16T10:00:00.000Z"
      )
    );
    expect(feed).toHaveBeenCalledWith(
      expect.objectContaining({
        group: "reminders",
        limit: 5,
        before: "2026-10-16T10:00:00.000Z",
      })
    );
  });

  it.each([["group=nope"], ["limit=abc"], ["before=yesterday"]])(
    "is 400 for %s",
    async (query) => {
      const res = await GET(get(`/api/notifications?feed=1&${query}`));
      expect(res.status).toBe(400);
    }
  );
});

describe("POST /api/notifications/read", () => {
  it("marks all", async () => {
    mark.mockResolvedValue({ marked: -1 });
    const res = await readPost(post("/api/notifications/read", { all: true }));
    expect(res.status).toBe(204);
    expect(mark).toHaveBeenCalledWith({
      userId: "u1",
      all: true,
      keys: undefined,
    });
  });

  it("marks keys", async () => {
    mark.mockResolvedValue({ marked: 1 });
    const res = await readPost(
      post("/api/notifications/read", { keys: ["a"] })
    );
    expect(res.status).toBe(204);
    expect(mark).toHaveBeenCalledWith({
      userId: "u1",
      all: false,
      keys: ["a"],
    });
  });

  it("is 400 for a body the service refuses and for non-JSON", async () => {
    mark.mockRejectedValue(new NotificationReadError("bad keys"));
    expect((await readPost(post("/api/notifications/read", {}))).status).toBe(
      400
    );
    expect(
      (await readPost(post("/api/notifications/read", "{nope"))).status
    ).toBe(400);
  });

  it("is 401 without a session", async () => {
    session.mockResolvedValue(denied(401));
    const res = await readPost(post("/api/notifications/read", { all: true }));
    expect(res.status).toBe(401);
    expect(mark).not.toHaveBeenCalled();
  });
});

describe("/api/connect/notifications (connector token)", () => {
  it("serves the same feed", async () => {
    const res = await connectGet(
      get("/api/connect/notifications?group=reminders")
    );
    expect(res.status).toBe(200);
    expect(feed).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", workspace, group: "reminders" })
    );
  });

  it("marks read", async () => {
    mark.mockResolvedValue({ marked: 1 });
    const res = await connectRead(
      post("/api/connect/notifications/read", { keys: ["a"] })
    );
    expect(res.status).toBe(204);
  });

  it("returns the connector's refusal untouched", async () => {
    connector.mockResolvedValue(denied(403));
    expect((await connectGet(get("/api/connect/notifications"))).status).toBe(
      403
    );
    expect(feed).not.toHaveBeenCalled();
  });
});
