import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/nav/usage/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/prisma", () => {
  const prisma: Record<string, unknown> = {
    userSettings: {
      findUnique: jest.fn(async () => ({ prefs: { navPinned: ["tasks"] } })),
      upsert: jest.fn(async () => ({})),
    },
    $queryRaw: jest.fn(async () => [{ prefs: {} }]),
    $executeRaw: jest.fn(async () => 1),
  };
  prisma.$transaction = jest.fn(async (run: (tx: unknown) => unknown) =>
    run(prisma)
  );
  return { prisma };
});

const exec = prisma.$executeRaw as unknown as jest.Mock;

const post = async (body: unknown) =>
  (await POST(
    new NextRequest("http://localhost/api/nav/usage", {
      method: "POST",
      body: JSON.stringify(body),
    })
  ))!;

beforeEach(() => {
  jest.clearAllMocks();
  (authenticateRequest as jest.Mock).mockResolvedValue({ userId: "u1" });
});

describe("/api/nav/usage", () => {
  it("GET returns the order and the pins", async () => {
    const res = await GET(new NextRequest("http://localhost/api/nav/usage"));
    const body = await res.json();
    expect(body.pinned).toEqual(["tasks"]);
    expect(body.order[0]).toBe("today");
    expect(body.ranked).toHaveLength(body.order.length);
  });

  it("POST refuses an unknown place", async () => {
    expect((await post({ place: "nope" })).status).toBe(400);
  });

  it("POST counts an open as a merge of nav keys only", async () => {
    const res = await post({ place: "tasks" });
    expect(res.status).toBe(200);
    expect(exec).toHaveBeenCalledTimes(1);
    const [strings, put] = exec.mock.calls[0];
    expect((strings as string[]).join("?")).toContain(
      `COALESCE("prefs", '{}'::jsonb) || ?::jsonb`
    );
    const patch = JSON.parse(put as string);
    expect(Object.keys(patch).every((k) => k.startsWith("nav"))).toBe(true);
    const days = Object.values(patch.navUsage) as Record<string, number>[];
    expect(days[0].tasks).toBe(1);
  });

  it("POST makes the settings row when there is none, then counts", async () => {
    const query = prisma.$queryRaw as unknown as jest.Mock;
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ prefs: {} }]);
    const res = await post({ place: "docs" });
    expect(res.status).toBe(200);
    expect(prisma.userSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } })
    );
    expect(exec).toHaveBeenCalledTimes(1);
  });
});
