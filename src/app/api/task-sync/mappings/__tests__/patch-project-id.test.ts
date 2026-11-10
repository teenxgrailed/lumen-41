import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

import { PATCH } from "../[id]/route";

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: async () => ({ userId: "user-1", workspace: null }),
}));
jest.mock("@/lib/auth/workspace-auth", () => ({
  workspaceDataScopeWhere: () => ({}),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    taskListMapping: { findFirst: jest.fn(), update: jest.fn() },
    project: { findFirst: jest.fn() },
  },
}));

describe("PATCH /api/task-sync/mappings/[id]", () => {
  it("accepts a cuid projectId (not rejected as a non-uuid)", async () => {
    (prisma.taskListMapping.findFirst as jest.Mock).mockResolvedValue({
      id: "m1",
    });
    (prisma.project.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await PATCH(
      new NextRequest("http://localhost/api/task-sync/mappings/m1", {
        method: "PATCH",
        body: JSON.stringify({ projectId: "cm0abc123def456ghi789jkl0" }),
      }),
      { params: Promise.resolve({ id: "m1" }) }
    );
    // Passes validation; the ownership check (not the schema) decides.
    expect(res.status).not.toBe(400);
  });
});
