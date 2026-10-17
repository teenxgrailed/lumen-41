import { NextRequest } from "next/server";

import { GET } from "@/app/api/needt/today/route";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prismaDataSource } from "@/lib/needt/prisma-source";

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/needt/prisma-source");
// The route asks for the person's day; that reads the database, which the
// deploy gates (no DATABASE_URL) do not have.
jest.mock("@/services/habits/habit-service", () => ({
  habitTodayKey: jest.fn().mockResolvedValue("2026-10-17"),
}));

const workspace = {
  enabled: true,
  workspaceId: "workspace-1",
  workspaceKind: WorkspaceKind.SHARED,
  role: WorkspaceRole.EDITOR,
  dataScope: { mode: "workspace" as const, workspaceId: "workspace-1" },
};

describe("Needt Today API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(authenticateRequest).mockResolvedValue({
      userId: "user-1",
      workspace,
    });
  });

  it("reads all Today data through the authorized workspace source", async () => {
    const source = {
      getTasks: jest.fn().mockResolvedValue([{ id: "task-1" }]),
      getProjects: jest.fn().mockResolvedValue([{ id: "project-1" }]),
      getHabits: jest.fn().mockResolvedValue([{ id: "habit-1" }]),
    };
    jest
      .mocked(prismaDataSource)
      .mockReturnValue(
        source as unknown as ReturnType<typeof prismaDataSource>
      );

    const request = new NextRequest("http://localhost/api/needt/today", {
      headers: { "x-workspace-id": workspace.workspaceId },
    });
    const response = (await GET(request))!;
    const body = await response.json();

    expect(authenticateRequest).toHaveBeenCalledWith(request, "NeedtTodayAPI");
    expect(prismaDataSource).toHaveBeenCalledWith(
      "user-1",
      workspace,
      expect.any(Function)
    );
    expect(source.getTasks).toHaveBeenCalledTimes(1);
    expect(source.getProjects).toHaveBeenCalledTimes(1);
    expect(source.getHabits).toHaveBeenCalledTimes(1);
    expect(body).toEqual(
      expect.objectContaining({
        tasks: [{ id: "task-1" }],
        projects: [{ id: "project-1" }],
        habits: [{ id: "habit-1" }],
        canEdit: true,
      })
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("marks viewers read-only", async () => {
    jest.mocked(authenticateRequest).mockResolvedValue({
      userId: "user-1",
      workspace: { ...workspace, role: WorkspaceRole.VIEWER },
    });
    jest.mocked(prismaDataSource).mockReturnValue({
      getTasks: jest.fn().mockResolvedValue([]),
      getProjects: jest.fn().mockResolvedValue([]),
      getHabits: jest.fn().mockResolvedValue([]),
    } as unknown as ReturnType<typeof prismaDataSource>);

    const response = (await GET(
      new NextRequest("http://localhost/api/needt/today")
    ))!;
    expect((await response.json()).canEdit).toBe(false);
  });
});
