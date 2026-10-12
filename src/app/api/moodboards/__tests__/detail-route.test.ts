import { NextRequest } from "next/server";

import { PUT } from "@/app/api/moodboards/[id]/permissions/route";
import { DELETE } from "@/app/api/moodboards/[id]/route";
import { GET as LIST } from "@/app/api/moodboards/route";
import { MoodboardAccessRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/auth/moodboard-auth", () => ({
  resolveMoodboardAccess: jest.fn(),
  inheritedMoodboardRole: () => "VIEWER",
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    moodboard: {
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    workspaceMember: { findFirst: jest.fn(), findUnique: jest.fn() },
    moodboardAccessGrant: { upsert: jest.fn() },
  },
}));

const { resolveMoodboardAccess } = jest.requireMock<
  typeof import("@/lib/auth/moodboard-auth")
>("@/lib/auth/moodboard-auth");
const { prisma } =
  jest.requireMock<typeof import("@/lib/prisma")>("@/lib/prisma");
const resolve = resolveMoodboardAccess as jest.Mock;
const RANK = { VIEWER: 0, EDITOR: 1, FULL_ACCESS: 2 } as const;
const actAs = (role: MoodboardAccessRole | null) =>
  resolve.mockImplementation(
    async (
      _a: unknown,
      _id: string,
      need: MoodboardAccessRole = MoodboardAccessRole.VIEWER
    ) => (role && RANK[role] >= RANK[need] ? { moodboardId: "b1", role } : null)
  );

const auth = { userId: "u1", workspace: { workspaceId: "w1", role: "OWNER" } };
const ctx = { params: Promise.resolve({ id: "b1" }) };
const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  (authenticateRequest as jest.Mock).mockResolvedValue(auth);
  actAs(MoodboardAccessRole.FULL_ACCESS);
});

describe("DELETE /api/moodboards/:id?permanent=true (Trash → Delete forever)", () => {
  const forever = () =>
    DELETE(req("/api/moodboards/b1?permanent=true", "DELETE"), ctx);

  it("deletes a board that is in Trash, scoped to the workspace", async () => {
    (prisma.moodboard.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
    expect((await forever())?.status).toBe(204);
    expect(prisma.moodboard.deleteMany).toHaveBeenCalledWith({
      where: { id: "b1", workspaceId: "w1", trashedAt: { not: null } },
    });
  });

  it("refuses a board that is not in Trash (409) and deletes nothing", async () => {
    (prisma.moodboard.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    expect((await forever())?.status).toBe(409);
  });

  it.each([MoodboardAccessRole.VIEWER, MoodboardAccessRole.EDITOR, null])(
    "refuses %s with 403, before touching the board",
    async (role) => {
      actAs(role);
      expect((await forever())?.status).toBe(403);
      expect(prisma.moodboard.deleteMany).not.toHaveBeenCalled();
    }
  );

  it("without ?permanent it still only archives (the public API's meaning)", async () => {
    (prisma.moodboard.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.moodboard.findFirst as jest.Mock).mockResolvedValue({ id: "b1" });
    await DELETE(req("/api/moodboards/b1", "DELETE"), ctx);
    expect(prisma.moodboard.deleteMany).not.toHaveBeenCalled();
    expect(prisma.moodboard.updateMany).toHaveBeenCalled();
  });
});

describe("GET /api/moodboards", () => {
  it("passes ?sort and ?dir to the query", async () => {
    await LIST(req("/api/moodboards?sort=created&dir=asc", "GET"));
    expect(
      (prisma.moodboard.findMany as jest.Mock).mock.calls[0][0].orderBy
    ).toEqual({ createdAt: "asc" });
  });
});

describe("PUT /api/moodboards/:id/permissions with an email", () => {
  const invite = (body: unknown) =>
    PUT(req("/api/moodboards/b1/permissions", "PUT", body), ctx);

  it("refuses Full access by email, and an address that is not one (400)", async () => {
    expect(
      (await invite({ email: "a@b.io", role: "FULL_ACCESS" }))?.status
    ).toBe(400);
    expect((await invite({ email: "nope", role: "VIEWER" }))?.status).toBe(400);
    expect(prisma.moodboardAccessGrant.upsert).not.toHaveBeenCalled();
  });

  it("answers 403 for someone outside the workspace", async () => {
    (prisma.moodboard.findFirst as jest.Mock).mockResolvedValue({
      id: "b1",
      createdById: "u1",
      workspaceId: "w1",
    });
    (prisma.workspaceMember.findFirst as jest.Mock).mockResolvedValue(null);
    expect((await invite({ email: "x@y.io", role: "VIEWER" }))?.status).toBe(
      403
    );
  });

  it("answers 403 to a caller without full access, whatever the body", async () => {
    actAs(MoodboardAccessRole.EDITOR);
    expect((await invite({ email: "x@y.io", role: "VIEWER" }))?.status).toBe(
      403
    );
    expect(prisma.moodboardAccessGrant.upsert).not.toHaveBeenCalled();
  });
});
