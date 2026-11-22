import { NextRequest } from "next/server";

import * as projectRoute from "@/app/api/projects/[id]/route";
import * as projectsRoute from "@/app/api/projects/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const projectModel = prisma.project as unknown as {
  create: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  update: jest.Mock;
};

const workspaceAccess = {
  enabled: true,
  workspaceId: "workspace-1",
  workspaceKind: "SHARED" as const,
  role: "EDITOR" as const,
  dataScope: { mode: "workspace" as const, workspaceId: "workspace-1" },
};

describe("projects API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(authenticateRequest).mockResolvedValue({
      userId: "user-1",
      workspace: workspaceAccess,
    });
  });

  it("scopes reads to the active workspace and derives progress", async () => {
    projectModel.findMany.mockResolvedValue([
      {
        id: "project-1",
        name: "Launch",
        progress: 99,
        tasks: [
          { status: "completed", isArchived: false },
          { status: "todo", isArchived: false },
        ],
        stages: [],
        blockers: [{ id: "blocker-1" }],
        taskListMappings: [
          { provider: { type: "google" } },
          { provider: { type: "google" } },
        ],
      },
    ]);

    const response = await projectsRoute.GET(
      new NextRequest("http://localhost/api/projects")
    );
    expect(projectModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "workspace-1" }),
      })
    );
    const body = await response!.json();
    expect(body[0]).toEqual(
      expect.objectContaining({
        progress: 50,
        completed: 1,
        total: 2,
        blockerCount: 1,
        connectedApps: ["google"],
      })
    );
    expect(body[0]).not.toHaveProperty("taskListMappings");
  });

  it("creates projects in the authorized workspace", async () => {
    projectModel.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "project-1", ...data })
    );
    const response = await projectsRoute.POST(
      new NextRequest("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: "Launch" }),
      })
    );

    expect(response!.status).toBe(201);
    expect(authenticateRequest).toHaveBeenCalledWith(
      expect.any(NextRequest),
      "projects-route",
      { requiredRole: "EDITOR" }
    );
    expect(projectModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          workspaceId: "workspace-1",
        }),
      })
    );
  });

  it("ignores manual progress and returns derived progress after an update", async () => {
    projectModel.findFirst.mockResolvedValue({
      id: "project-1",
      startDate: null,
      deadline: null,
    });
    projectModel.update.mockResolvedValue({
      id: "project-1",
      name: "Launch",
      progress: 80,
      tasks: [
        { status: "completed", isArchived: false },
        { status: "completed", isArchived: false },
        { status: "todo", isArchived: false },
      ],
    });

    const response = await projectRoute.PUT(
      new NextRequest("http://localhost/api/projects/project-1", {
        method: "PUT",
        body: JSON.stringify({ progress: 80 }),
      }),
      { params: Promise.resolve({ id: "project-1" }) }
    );
    expect((await response!.json()).progress).toBe(67);
    expect(projectModel.update.mock.calls[0][0].data).not.toHaveProperty(
      "progress"
    );
  });

  it("archives without deleting tasks and keeps the transition idempotent", async () => {
    projectModel.findFirst.mockResolvedValue({
      id: "project-1",
      status: "active",
      tasks: [
        { status: "completed", isArchived: false },
        { status: "todo", isArchived: false },
      ],
    });
    projectModel.update.mockResolvedValue({
      id: "project-1",
      name: "Launch",
      status: "archived",
    });

    const response = await projectRoute.DELETE(
      new NextRequest("http://localhost/api/projects/project-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "project-1" }) }
    );

    expect(response!.status).toBe(200);
    expect(projectModel.update).toHaveBeenCalledWith({
      where: { id: "project-1", workspaceId: "workspace-1" },
      data: { status: "archived" },
    });
    expect(await response!.json()).toEqual(
      expect.objectContaining({
        status: "archived",
        completed: 1,
        total: 2,
        progress: 50,
      })
    );
  });

  it("rejects cross-workspace archive attempts without writing", async () => {
    projectModel.findFirst.mockResolvedValue(null);

    const response = await projectRoute.DELETE(
      new NextRequest("http://localhost/api/projects/outside-project", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "outside-project" }) }
    );

    expect(response!.status).toBe(404);
    expect(projectModel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "outside-project", workspaceId: "workspace-1" },
      })
    );
    expect(projectModel.update).not.toHaveBeenCalled();
  });

  it("allows only restoration writes for an archived project", async () => {
    projectModel.findFirst.mockResolvedValue({
      id: "project-1",
      status: "archived",
      startDate: null,
      deadline: null,
    });

    const rejected = await projectRoute.PUT(
      new NextRequest("http://localhost/api/projects/project-1", {
        method: "PUT",
        body: JSON.stringify({ name: "Changed" }),
      }),
      { params: Promise.resolve({ id: "project-1" }) }
    );
    expect(rejected!.status).toBe(409);
    expect(projectModel.update).not.toHaveBeenCalled();

    projectModel.update.mockResolvedValue({
      id: "project-1",
      status: "active",
      tasks: [],
    });
    const restored = await projectRoute.PUT(
      new NextRequest("http://localhost/api/projects/project-1", {
        method: "PUT",
        body: JSON.stringify({ status: "active" }),
      }),
      { params: Promise.resolve({ id: "project-1" }) }
    );
    expect(restored!.status).toBe(200);
    expect(projectModel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "active" }),
      })
    );
  });
});
