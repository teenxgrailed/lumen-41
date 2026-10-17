import { NextRequest } from "next/server";

import { POST } from "@/app/api/accounts/[id]/sync/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { enqueueCalendarSync } from "@/lib/queue/enqueue";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: { connectedAccount: { findFirst: jest.fn() } },
}));
jest.mock("@/lib/queue/enqueue", () => ({ enqueueCalendarSync: jest.fn() }));

const findFirst = prisma.connectedAccount.findFirst as unknown as jest.Mock;
const enqueue = enqueueCalendarSync as jest.Mock;

const post = async (id = "a1") => {
  const res = await POST(
    new NextRequest(`http://localhost/api/accounts/${id}/sync`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id }) }
  );
  if (!res) throw new Error("the route sent no response");
  return res;
};

describe("POST /api/accounts/[id]/sync", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (authenticateRequest as jest.Mock).mockResolvedValue({ userId: "u1" });
  });

  it("queues the sync of every enabled calendar of the caller's account", async () => {
    findFirst.mockResolvedValue({
      id: "a1",
      calendars: [{ id: "c1" }, { id: "c2" }],
    });
    enqueue.mockResolvedValue({ id: "job" });
    const res = await post();
    expect(await res.json()).toEqual({ queued: 2 });
    expect(enqueue).toHaveBeenCalledWith("c1");
    expect(enqueue).toHaveBeenCalledWith("c2");
    expect(findFirst.mock.calls[0][0].where).toEqual({
      id: "a1",
      userId: "u1",
    });
  });

  it("answers 404 for an account that is not the caller's", async () => {
    findFirst.mockResolvedValue(null);
    expect((await post()).status).toBe(404);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("answers 503 when there are calendars but no queue", async () => {
    findFirst.mockResolvedValue({ id: "a1", calendars: [{ id: "c1" }] });
    enqueue.mockResolvedValue(null);
    expect((await post()).status).toBe(503);
  });

  it("queues nothing for an account with no enabled calendar", async () => {
    findFirst.mockResolvedValue({ id: "a1", calendars: [] });
    const res = await post();
    expect(await res.json()).toEqual({ queued: 0 });
  });

  it("answers the auth failure as is", async () => {
    (authenticateRequest as jest.Mock).mockResolvedValue({
      response: new Response(null, { status: 401 }),
    });
    expect((await post()).status).toBe(401);
  });
});
