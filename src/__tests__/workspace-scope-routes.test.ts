import { NextRequest, NextResponse } from "next/server";

import { GET as exportTasks } from "@/app/api/export/tasks/route";
import { GET as logSources } from "@/app/api/logs/sources/route";
import { GET as globalSearch } from "@/app/api/search/route";
import {
  POST as createMapping,
  GET as listMappings,
} from "@/app/api/task-sync/mappings/route";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";
import { readFileSync } from "node:fs";

import { authenticateRequest, requireAdmin } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: jest.fn(),
  requireAdmin: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    calendarEvent: { findMany: jest.fn() },
    log: { findMany: jest.fn() },
    project: { findMany: jest.fn() },
    tag: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
    taskListMapping: { findMany: jest.fn() },
  },
}));

const workspace = {
  enabled: true,
  workspaceId: "workspace-1",
  workspaceKind: WorkspaceKind.SHARED,
  role: WorkspaceRole.EDITOR,
  dataScope: { mode: "workspace" as const, workspaceId: "workspace-1" },
};

function request(path: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: { "x-workspace-id": workspace.workspaceId },
  });
}

describe("workspace-scoped API surfaces", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(authenticateRequest).mockResolvedValue({
      userId: "user-1",
      workspace,
    });
    jest.mocked(requireAdmin).mockResolvedValue(null);
    jest.mocked(prisma.task.findMany).mockResolvedValue([]);
    jest.mocked(prisma.project.findMany).mockResolvedValue([]);
    jest.mocked(prisma.calendarEvent.findMany).mockResolvedValue([]);
    jest.mocked(prisma.tag.findMany).mockResolvedValue([]);
    jest.mocked(prisma.taskListMapping.findMany).mockResolvedValue([]);
    jest.mocked(prisma.log.findMany).mockResolvedValue([]);
  });

  it("scopes global search and hides personal calendar details in shared workspaces", async () => {
    const response = await globalSearch(request("/api/search?q=release"));

    expect(response?.status).toBe(200);
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "workspace-1" }),
      })
    );
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "workspace-1" }),
      })
    );
    expect(prisma.calendarEvent.findMany).not.toHaveBeenCalled();
  });

  it("exports only tasks, projects and attached tags from the active workspace", async () => {
    const response = await exportTasks(request("/api/export/tasks"));

    expect(response?.status).toBe(200);
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "workspace-1" }),
      })
    );
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "workspace-1" } })
    );
    expect(prisma.tag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tasks: { some: { workspaceId: "workspace-1" } } },
      })
    );
  });

  it("lists only task-sync mappings whose project is in the active workspace", async () => {
    const response = await listMappings(request("/api/task-sync/mappings"));

    expect(response?.status).toBe(200);
    expect(prisma.taskListMapping.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          project: { workspaceId: "workspace-1" },
        }),
      })
    );
  });

  it("requires an Editor role before creating a task-sync mapping", async () => {
    jest.mocked(authenticateRequest).mockResolvedValue({
      response: NextResponse.json(
        { error: "The requested workspace role is required." },
        { status: 403 }
      ),
    });
    const mutation = new NextRequest(
      "http://localhost/api/task-sync/mappings",
      {
        method: "POST",
        body: JSON.stringify({}),
      }
    );

    const response = await createMapping(mutation);

    expect(response?.status).toBe(403);
    expect(authenticateRequest).toHaveBeenCalledWith(
      mutation,
      expect.any(String),
      { requiredRole: "EDITOR" }
    );
    expect(prisma.taskListMapping.findMany).not.toHaveBeenCalled();
  });

  it("does not query log sources when admin authorization is denied", async () => {
    jest
      .mocked(requireAdmin)
      .mockResolvedValue(
        NextResponse.json({ error: "Forbidden" }, { status: 403 })
      );

    const response = await logSources(request("/api/logs/sources"));

    expect(response.status).toBe(403);
    expect(prisma.log.findMany).not.toHaveBeenCalled();
  });

  it("keeps AI task/project lookups and schedule tokens workspace-bound", () => {
    const chat =
      readFileSync("src/app/api/ai/chat/route.ts", "utf8") +
      readFileSync("src/services/ai/agent/legacy-tools.ts", "utf8");
    const preview = readFileSync(
      "src/services/ai/reschedule-preview.ts",
      "utf8"
    );

    expect(chat).toContain("workspaceDataScopeWhere(workspace, userId)");
    expect(chat).toContain("auth.workspace?.role === WorkspaceRole.VIEWER");
    expect(preview).toContain("value.workspaceId !== workspaceId");
    expect(preview).toContain("where: { ...scope, isArchived: false }");
  });

  it("keeps connector-triggered scheduling in the authorized workspace", () => {
    const scheduler = readFileSync(
      "src/services/scheduling/TaskSchedulingService.ts",
      "utf8"
    );
    const connectorRoutes = [
      "src/app/api/connect/control/route.ts",
      "src/app/api/connect/reschedule/route.ts",
      "src/app/api/connect/schedule/route.ts",
      "src/app/api/connect/tasks/route.ts",
    ].map((path) => readFileSync(path, "utf8"));

    expect(scheduler).toContain("options.workspaceId");
    expect(scheduler).toContain("{ workspaceId: options.workspaceId }");
    for (const route of connectorRoutes) {
      expect(route).toContain("scheduleAllTasksForUser");
      expect(route).toContain("workspaceId:");
    }
  });
});
