import { NextRequest } from "next/server";

import {
  DELETE as rawDelete,
  GET as rawGet,
  POST as rawPost,
} from "@/app/api/push-subscriptions/native/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    nativePushToken: {
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

type Handler = (request: NextRequest) => Promise<Response | undefined>;
const run = (handler: unknown) => async (request: NextRequest) => {
  const response = await (handler as Handler)(request);
  if (!response) throw new Error("Expected a route response.");
  return response;
};
const GET = run(rawGet);
const POST = run(rawPost);
const DELETE = run(rawDelete);

const tokens = jest.mocked(prisma.nativePushToken);
const token = "AB".repeat(32);

function request(method: string, body?: unknown, search = "") {
  return new NextRequest(
    `http://localhost/api/push-subscriptions/native${search}`,
    {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }
  );
}

const saved = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(authenticateRequest)
    .mockResolvedValue({ userId: "user-1" } as never);
  tokens.upsert.mockResolvedValue({ id: "tok-1" } as never);
  delete process.env.APNS_KEY_ID;
  delete process.env.APNS_TEAM_ID;
  delete process.env.APNS_PRIVATE_KEY;
});
afterAll(() => {
  process.env = saved;
});

describe("/api/push-subscriptions/native", () => {
  it("says whether the server has an APNs key", async () => {
    expect(await (await GET(request("GET"))).json()).toEqual({
      configured: false,
    });
    process.env.APNS_KEY_ID = "K";
    process.env.APNS_TEAM_ID = "T";
    process.env.APNS_PRIVATE_KEY = "pem";
    expect(await (await GET(request("GET"))).json()).toEqual({
      configured: true,
    });
  });

  it("saves an iOS token in lower case for the signed-in person", async () => {
    tokens.findUnique.mockResolvedValue(null);
    const response = await POST(request("POST", { token, platform: "ios" }));
    expect(response.status).toBe(201);
    expect(tokens.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: token.toLowerCase() },
        update: { userId: "user-1" },
        create: expect.objectContaining({
          userId: "user-1",
          token: token.toLowerCase(),
          platform: "ios",
          bundleId: "app.needt.ios",
        }),
      })
    );
  });

  it("refuses anything that is not a hex APNs token", async () => {
    for (const body of [
      { token: "../../etc", platform: "ios" },
      { token: "ab", platform: "ios" },
      { token, platform: "android" },
      {},
    ]) {
      expect((await POST(request("POST", body))).status).toBe(400);
    }
    expect(tokens.upsert).not.toHaveBeenCalled();
  });

  it("deletes only the caller's own token", async () => {
    const response = await DELETE(
      request("DELETE", undefined, `?token=${token}`)
    );
    expect(response.status).toBe(204);
    expect(tokens.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", token: token.toLowerCase() },
    });
  });
});
