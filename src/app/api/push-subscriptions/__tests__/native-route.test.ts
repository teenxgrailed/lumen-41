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
        update: { userId: "user-1", updatedAt: expect.any(Date) },
        create: expect.objectContaining({
          userId: "user-1",
          token: token.toLowerCase(),
          platform: "ios",
          bundleId: "app.needt.ios",
        }),
      })
    );
  });

  it("saves the Mac app's token under the Mac bundle, sandbox for a debug build", async () => {
    tokens.findUnique.mockResolvedValue(null);
    const response = await POST(
      request("POST", { token, platform: "macos", environment: "sandbox" })
    );
    expect(response.status).toBe(201);
    expect(tokens.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          platform: "macos",
          bundleId: "app.needt.mac",
          environment: "sandbox",
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

describe("one phone, two accounts", () => {
  // The table as the route sees it: token -> owner.
  const rows = new Map<string, { id: string; userId: string }>();
  const as = (userId: string) =>
    jest.mocked(authenticateRequest).mockResolvedValue({ userId } as never);

  beforeEach(() => {
    rows.clear();
    tokens.findUnique.mockImplementation((async ({
      where,
    }: {
      where: { token: string };
    }) => {
      const row = rows.get(where.token);
      return row ? { userId: row.userId } : null;
    }) as never);
    tokens.upsert.mockImplementation((async ({
      where,
      update,
      create,
    }: {
      where: { token: string };
      update: { userId: string };
      create: { userId: string };
    }) => {
      const row = rows.get(where.token);
      const next = row
        ? { ...row, userId: update.userId }
        : { id: `tok-${rows.size + 1}`, userId: create.userId };
      rows.set(where.token, next);
      return { id: next.id };
    }) as never);
    tokens.deleteMany.mockImplementation((async ({
      where,
    }: {
      where: { userId: string; token: string };
    }) => {
      const row = rows.get(where.token);
      if (!row || row.userId !== where.userId) return { count: 0 };
      rows.delete(where.token);
      return { count: 1 };
    }) as never);
  });

  it("moves the token to whoever signs in on the phone next", async () => {
    as("user-a");
    await POST(request("POST", { token, platform: "ios" }));
    as("user-b");
    await POST(request("POST", { token, platform: "ios" }));
    expect(rows.get(token.toLowerCase())?.userId).toBe("user-b");
    expect(rows.size).toBe(1);
  });

  it("does not let the previous owner remove the new owner's token", async () => {
    as("user-a");
    await POST(request("POST", { token, platform: "ios" }));
    as("user-b");
    await POST(request("POST", { token, platform: "ios" }));
    as("user-a");
    const response = await DELETE(
      request("DELETE", undefined, `?token=${token}`)
    );
    expect(response.status).toBe(204);
    expect(rows.get(token.toLowerCase())?.userId).toBe("user-b");
  });

  it("lets the owner remove it, after which another account can take it", async () => {
    as("user-a");
    await POST(request("POST", { token, platform: "ios" }));
    await DELETE(request("DELETE", undefined, `?token=${token}`));
    expect(rows.size).toBe(0);
    as("user-b");
    await POST(request("POST", { token, platform: "ios" }));
    expect(rows.get(token.toLowerCase())?.userId).toBe("user-b");
  });
});
