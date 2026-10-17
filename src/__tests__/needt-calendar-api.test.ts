import { NextRequest } from "next/server";

import { GET } from "@/app/api/needt/calendar/route";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { prismaDataSource } from "@/lib/needt/prisma-source";
import { prisma } from "@/lib/prisma";
import { ensureDefaultWorkSchedule } from "@/lib/work-schedules";

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/work-schedules", () => ({
  ensureDefaultWorkSchedule: jest.fn(),
}));
jest.mock("@/lib/needt/prisma-source");
jest.mock("@/lib/prisma", () => ({
  prisma: {
    userSettings: { findUnique: jest.fn() },
    calendarSettings: { findUnique: jest.fn() },
    flexibleHoursOverride: { findMany: jest.fn() },
  },
}));

const workspace = {
  enabled: true,
  workspaceId: "workspace-1",
  workspaceKind: WorkspaceKind.SHARED,
  role: WorkspaceRole.EDITOR,
  dataScope: { mode: "workspace" as const, workspaceId: "workspace-1" },
};

describe("Needt Calendar API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(authenticateRequest).mockResolvedValue({
      userId: "user-1",
      workspace,
    });
    jest.mocked(prisma.userSettings.findUnique).mockResolvedValue({
      timeFormat: "24h",
      weekStartDay: "monday",
    } as never);
    jest.mocked(prisma.calendarSettings.findUnique).mockResolvedValue({
      workingHoursStart: "08:30",
      workingHoursEnd: "17:45",
    } as never);
    jest.mocked(prisma.flexibleHoursOverride.findMany).mockResolvedValue([]);
    jest.mocked(ensureDefaultWorkSchedule).mockResolvedValue({
      windows: [
        { dayOfWeek: 1, startTime: "08:30", endTime: "17:45", sortOrder: 0 },
      ],
    } as never);
  });

  it("reads entries through the authorized workspace source", async () => {
    const source = {
      getCalendarEntries: jest.fn().mockResolvedValue([{ id: "task:block" }]),
      getProjects: jest.fn().mockResolvedValue([{ id: "project-1" }]),
      getCalendars: jest.fn().mockResolvedValue({ work: { name: "Work" } }),
    };
    jest
      .mocked(prismaDataSource)
      .mockReturnValue(
        source as unknown as ReturnType<typeof prismaDataSource>
      );

    const request = new NextRequest(
      "http://localhost/api/needt/calendar?start=2026-09-01T00:00:00.000Z&end=2026-10-01T00:00:00.000Z",
      { headers: { "x-workspace-id": workspace.workspaceId } }
    );
    const response = (await GET(request))!;
    const body = await response.json();

    expect(authenticateRequest).toHaveBeenCalledWith(
      request,
      "NeedtCalendarAPI"
    );
    expect(prismaDataSource).toHaveBeenCalledWith(
      "user-1",
      workspace,
      expect.any(Function)
    );
    expect(source.getCalendarEntries).toHaveBeenCalledWith(
      newDate("2026-09-01T00:00:00.000Z"),
      newDate("2026-10-01T00:00:00.000Z")
    );
    expect(body).toEqual(
      expect.objectContaining({
        workspaceId: "workspace-1",
        entries: [{ id: "task:block" }],
        canEdit: true,
        options: expect.objectContaining({
          use24Hour: true,
          weekStart: "mon",
          workStart: 8.5,
          workEnd: 17.75,
        }),
      })
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("marks viewers read-only and rejects an oversized range", async () => {
    jest.mocked(authenticateRequest).mockResolvedValue({
      userId: "user-1",
      workspace: { ...workspace, role: WorkspaceRole.VIEWER },
    });
    jest.mocked(prismaDataSource).mockReturnValue({
      getCalendarEntries: jest.fn().mockResolvedValue([]),
      getProjects: jest.fn().mockResolvedValue([]),
      getCalendars: jest.fn().mockResolvedValue({}),
    } as unknown as ReturnType<typeof prismaDataSource>);

    const viewerResponse = (await GET(
      new NextRequest("http://localhost/api/needt/calendar")
    ))!;
    expect((await viewerResponse.json()).canEdit).toBe(false);

    const invalidResponse = (await GET(
      new NextRequest(
        "http://localhost/api/needt/calendar?start=2026-01-01T00:00:00.000Z&end=2028-01-01T00:00:00.000Z"
      )
    ))!;
    expect(invalidResponse.status).toBe(400);
  });
});
