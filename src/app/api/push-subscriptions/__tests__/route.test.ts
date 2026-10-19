import { NextRequest } from "next/server";

import {
  DELETE as rawDelete,
  GET as rawGet,
  POST as rawPost,
} from "@/app/api/push-subscriptions/route";
import { POST as rawTestPost } from "@/app/api/push-subscriptions/test/route";
import { deliverPush } from "@/services/reminders/reminder-delivery";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    pushSubscription: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock("@/services/reminders/reminder-delivery", () => ({
  deliverPush: jest.fn(),
}));

type Handler = (request: NextRequest) => Promise<Response | undefined>;
const defined =
  (handler: Handler) =>
  async (request: NextRequest): Promise<Response> => {
    const response = await handler(request);
    if (!response) throw new Error("Expected a route response.");
    return response;
  };
const GET = defined(rawGet as Handler);
const POST = defined(rawPost as Handler);
const DELETE = defined(rawDelete as Handler);
const TEST_POST = defined(rawTestPost as Handler);

const mockAuth = jest.mocked(authenticateRequest);
const subs = jest.mocked(prisma.pushSubscription);
const mockDeliver = jest.mocked(deliverPush);

const saved = {
  subject: process.env.VAPID_SUBJECT,
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
  alias: process.env.VAPID_PUBLIC_KEY,
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function configure() {
  process.env.VAPID_SUBJECT = "mailto:push@example.com";
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public-key";
  process.env.VAPID_PRIVATE_KEY = "private-key";
  delete process.env.VAPID_PUBLIC_KEY;
}

function request(method: string, body?: unknown, search = "") {
  return new NextRequest(`http://localhost/api/push-subscriptions${search}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const valid = {
  endpoint: "https://push.example.test/abc",
  expirationTime: null,
  keys: { p256dh: "p", auth: "a" },
};

beforeEach(() => {
  jest.clearAllMocks();
  configure();
  mockAuth.mockResolvedValue({ userId: "user-1" } as never);
});

afterAll(() => {
  restore("VAPID_SUBJECT", saved.subject);
  restore("NEXT_PUBLIC_VAPID_PUBLIC_KEY", saved.publicKey);
  restore("VAPID_PRIVATE_KEY", saved.privateKey);
  restore("VAPID_PUBLIC_KEY", saved.alias);
});

describe("GET /api/push-subscriptions", () => {
  it("serves the public key from the runtime environment", async () => {
    subs.findMany.mockResolvedValue([]);
    const body = await (await GET(request("GET"))).json();
    expect(body).toMatchObject({ configured: true, publicKey: "public-key" });
  });

  it("reports an unconfigured server without a key", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    subs.findMany.mockResolvedValue([]);
    const body = await (await GET(request("GET"))).json();
    expect(body).toMatchObject({ configured: false, publicKey: null });
  });

  it("accepts a server-only VAPID_PUBLIC_KEY alias", async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    process.env.VAPID_PUBLIC_KEY = "alias-key";
    subs.findMany.mockResolvedValue([]);
    const body = await (await GET(request("GET"))).json();
    expect(body).toMatchObject({ configured: true, publicKey: "alias-key" });
  });
});

describe("POST /api/push-subscriptions", () => {
  it("stores a valid subscription for the signed-in user", async () => {
    subs.findUnique.mockResolvedValue(null);
    subs.upsert.mockResolvedValue({ id: "sub-1" } as never);
    const response = await POST(request("POST", valid));
    expect(response.status).toBe(201);
    expect(subs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: valid.endpoint },
        create: expect.objectContaining({
          userId: "user-1",
          p256dh: "p",
          auth: "a",
        }),
      })
    );
  });

  it("rejects a non-https endpoint and missing keys", async () => {
    expect(
      (await POST(request("POST", { ...valid, endpoint: "http://x" }))).status
    ).toBe(400);
    expect(
      (await POST(request("POST", { endpoint: valid.endpoint, keys: {} })))
        .status
    ).toBe(400);
    expect(subs.upsert).not.toHaveBeenCalled();
  });

  it("re-binds an endpoint that belonged to another account to the current user", async () => {
    subs.findUnique.mockResolvedValue({ userId: "someone-else" } as never);
    subs.upsert.mockResolvedValue({ id: "sub-1" } as never);
    const response = await POST(request("POST", valid));
    expect(response.status).toBe(201);
    expect(subs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: valid.endpoint },
        update: expect.objectContaining({ userId: "user-1" }),
      })
    );
  });
});

describe("DELETE /api/push-subscriptions", () => {
  it("removes only the caller's own subscription", async () => {
    const response = await DELETE(
      request(
        "DELETE",
        undefined,
        "?endpoint=https%3A%2F%2Fpush.example.test%2Fabc"
      )
    );
    expect(response.status).toBe(204);
    expect(subs.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", endpoint: valid.endpoint },
    });
  });
});

describe("POST /api/push-subscriptions/test", () => {
  const stored = {
    id: "sub-1",
    endpoint: valid.endpoint,
    p256dh: "p",
    auth: "a",
  };

  it("sends a test notification to the named device", async () => {
    subs.findMany.mockResolvedValue([stored] as never);
    mockDeliver.mockResolvedValue(true);
    const response = await TEST_POST(
      request("POST", { endpoint: valid.endpoint })
    );
    expect(response.status).toBe(200);
    expect(subs.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", endpoint: valid.endpoint },
      })
    );
    expect(mockDeliver).toHaveBeenCalledWith(
      stored,
      expect.objectContaining({ title: "Needt", url: "/today" })
    );
  });

  it("answers 404 when the device is not subscribed", async () => {
    subs.findMany.mockResolvedValue([]);
    expect((await TEST_POST(request("POST", {}))).status).toBe(404);
    expect(mockDeliver).not.toHaveBeenCalled();
  });

  it("answers 410 when the push service says the subscription is gone", async () => {
    subs.findMany.mockResolvedValue([stored] as never);
    mockDeliver.mockResolvedValue(false);
    expect((await TEST_POST(request("POST", {}))).status).toBe(410);
  });

  it("answers 502 when the push service refuses the message", async () => {
    subs.findMany.mockResolvedValue([stored] as never);
    mockDeliver.mockRejectedValue(new Error("Push provider returned 403"));
    expect((await TEST_POST(request("POST", {}))).status).toBe(502);
  });

  it("answers 503 on a server without VAPID keys", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    expect((await TEST_POST(request("POST", {}))).status).toBe(503);
  });
});
