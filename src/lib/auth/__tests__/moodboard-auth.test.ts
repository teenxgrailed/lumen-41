import {
  MoodboardAccessRole,
  WorkspaceKind,
  WorkspaceRole,
} from "@prisma/client";

import { resolveMoodboardAccess } from "@/lib/auth/moodboard-auth";

jest.mock("@/lib/prisma", () => ({
  prisma: { moodboard: { findFirst: jest.fn() } },
}));

const { prisma } =
  jest.requireMock<typeof import("@/lib/prisma")>("@/lib/prisma");
const findFirst = prisma.moodboard.findFirst as jest.Mock;

function actor(role: WorkspaceRole) {
  return {
    userId: "member",
    workspace: {
      enabled: true,
      workspaceId: "workspace",
      workspaceKind: WorkspaceKind.SHARED,
      role,
      dataScope: { mode: "workspace" as const, workspaceId: "workspace" },
    },
  };
}

describe("Moodboard access resolver", () => {
  beforeEach(() => jest.clearAllMocks());

  it("scopes every lookup to the authenticated workspace", async () => {
    findFirst.mockResolvedValue(null);

    await resolveMoodboardAccess(actor(WorkspaceRole.EDITOR), "board");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "board",
          workspaceId: "workspace",
          archivedAt: null,
        }),
      })
    );
  });

  it("lets a direct Editor grant upgrade a workspace Viewer", async () => {
    findFirst.mockResolvedValue({
      id: "board",
      createdById: "creator",
      workspaceId: "workspace",
      accessGrants: [{ role: MoodboardAccessRole.EDITOR }],
    });

    await expect(
      resolveMoodboardAccess(
        actor(WorkspaceRole.VIEWER),
        "board",
        MoodboardAccessRole.EDITOR
      )
    ).resolves.toEqual({
      moodboardId: "board",
      role: MoodboardAccessRole.EDITOR,
      trashed: false,
    });
  });

  it("lets a direct Viewer grant downgrade a workspace Owner", async () => {
    findFirst.mockResolvedValue({
      id: "board",
      createdById: "another-owner",
      workspaceId: "workspace",
      accessGrants: [{ role: MoodboardAccessRole.VIEWER }],
    });

    await expect(
      resolveMoodboardAccess(
        actor(WorkspaceRole.OWNER),
        "board",
        MoodboardAccessRole.EDITOR
      )
    ).resolves.toBeNull();
  });

  it("keeps the Moodboard creator at Full Access", async () => {
    findFirst.mockResolvedValue({
      id: "board",
      createdById: "member",
      workspaceId: "workspace",
      accessGrants: [{ role: MoodboardAccessRole.VIEWER }],
    });

    await expect(
      resolveMoodboardAccess(
        actor(WorkspaceRole.VIEWER),
        "board",
        MoodboardAccessRole.FULL_ACCESS
      )
    ).resolves.toEqual({
      moodboardId: "board",
      role: MoodboardAccessRole.FULL_ACCESS,
      trashed: false,
    });
  });

  it("says when the board is in Trash, so writes can be refused (restore stays allowed)", async () => {
    findFirst.mockResolvedValue({
      id: "board",
      createdById: "creator",
      workspaceId: "workspace",
      trashedAt: new Date("2026-10-10T00:00:00Z"),
      accessGrants: [],
    });
    await expect(
      resolveMoodboardAccess(actor(WorkspaceRole.OWNER), "board")
    ).resolves.toMatchObject({ trashed: true });
  });
});
