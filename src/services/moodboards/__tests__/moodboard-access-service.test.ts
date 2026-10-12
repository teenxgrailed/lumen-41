import {
  inviteMoodboardMember,
  listMoodboardAccessGrants,
  removeMoodboardAccessGrant,
  setMoodboardAccessGrant,
} from "@/services/moodboards/moodboard-access-service";
import {
  MoodboardAccessRole,
  WorkspaceKind,
  WorkspaceRole,
} from "@prisma/client";

jest.mock("@/lib/auth/moodboard-auth", () => ({
  resolveMoodboardAccess: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    moodboard: { findFirst: jest.fn(), update: jest.fn() },
    moodboardAccessGrant: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    workspaceMember: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

const { resolveMoodboardAccess } = jest.requireMock<
  typeof import("@/lib/auth/moodboard-auth")
>("@/lib/auth/moodboard-auth");
const { prisma } =
  jest.requireMock<typeof import("@/lib/prisma")>("@/lib/prisma");
const resolveAccess = resolveMoodboardAccess as jest.Mock;
const moodboardFindFirst = prisma.moodboard.findFirst as jest.Mock;
const memberFindUnique = prisma.workspaceMember.findUnique as jest.Mock;
const memberFindFirst = prisma.workspaceMember.findFirst as jest.Mock;
const memberFindMany = prisma.workspaceMember.findMany as jest.Mock;
const grantUpsert = prisma.moodboardAccessGrant.upsert as jest.Mock;

const workspace = (role: WorkspaceRole) => ({
  enabled: true,
  workspaceId: "workspace",
  workspaceKind: WorkspaceKind.SHARED,
  role,
  dataScope: { mode: "workspace" as const, workspaceId: "workspace" },
});
const actor = { userId: "owner", workspace: workspace(WorkspaceRole.OWNER) };
const viewer = { userId: "viewer", workspace: workspace(WorkspaceRole.VIEWER) };

const RANK = { VIEWER: 0, EDITOR: 1, FULL_ACCESS: 2 } as const;
/** The real resolver's rule: the actor's role, if it reaches the required one. */
function actAs(role: MoodboardAccessRole | null) {
  resolveAccess.mockImplementation(
    async (
      _a: unknown,
      _id: string,
      required: MoodboardAccessRole = MoodboardAccessRole.VIEWER
    ) =>
      role && RANK[role] >= RANK[required]
        ? { moodboardId: "board", role }
        : null
  );
}

describe("Moodboard access grants", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    actAs(MoodboardAccessRole.FULL_ACCESS);
    moodboardFindFirst.mockResolvedValue({
      id: "board",
      createdById: "owner",
      workspaceId: "workspace",
      linkShare: false,
      createdBy: { name: "Owen", email: "o@x.io", image: null },
    });
    (prisma.moodboardAccessGrant.findMany as jest.Mock).mockResolvedValue([]);
    memberFindMany.mockResolvedValue([]);
  });

  describe("listing", () => {
    it("tells a caller with no access nothing, and reads nothing", async () => {
      actAs(null);
      await expect(
        listMoodboardAccessGrants(actor, "board")
      ).rejects.toMatchObject({ code: "MOODBOARD_NOT_FOUND", status: 404 });
      expect(prisma.moodboardAccessGrant.findMany).not.toHaveBeenCalled();
      expect(memberFindMany).not.toHaveBeenCalled();
    });

    it("lets a viewer see who is on the board, but not who could be invited", async () => {
      actAs(MoodboardAccessRole.VIEWER);
      const res = await listMoodboardAccessGrants(viewer, "board");
      expect(res.myRole).toBe(MoodboardAccessRole.VIEWER);
      expect(res.creator).toMatchObject({ name: "Owen" });
      expect(res.candidates).toEqual([]);
      expect(memberFindMany).not.toHaveBeenCalled();
    });

    it("gives full access the workspace members an invite can reach", async () => {
      memberFindMany.mockResolvedValue([
        {
          userId: "m1",
          user: { name: "Lena", email: "lena@x.io", image: null },
        },
      ]);
      const res = await listMoodboardAccessGrants(actor, "board");
      expect(res.candidates).toEqual([
        {
          userId: "m1",
          user: { name: "Lena", email: "lena@x.io", image: null },
        },
      ]);
    });
  });

  describe("changing roles needs full access, on the server", () => {
    it.each([MoodboardAccessRole.VIEWER, MoodboardAccessRole.EDITOR])(
      "a %s cannot give, change or invite",
      async (role) => {
        actAs(role);
        const who = { userId: "x", workspace: workspace(WorkspaceRole.EDITOR) };
        await expect(
          setMoodboardAccessGrant(
            who,
            "board",
            "m1",
            MoodboardAccessRole.EDITOR
          )
        ).rejects.toMatchObject({ code: "MOODBOARD_FULL_ACCESS_REQUIRED" });
        await expect(
          inviteMoodboardMember(
            who,
            "board",
            "m@x.io",
            MoodboardAccessRole.VIEWER
          )
        ).rejects.toMatchObject({ code: "MOODBOARD_FULL_ACCESS_REQUIRED" });
        await expect(
          removeMoodboardAccessGrant(who, "board", "m1")
        ).rejects.toMatchObject({ code: "MOODBOARD_FULL_ACCESS_REQUIRED" });
        expect(grantUpsert).not.toHaveBeenCalled();
        expect(prisma.moodboardAccessGrant.deleteMany).not.toHaveBeenCalled();
      }
    );
  });

  it("refuses to grant access to a non-member", async () => {
    memberFindUnique.mockResolvedValue(null);

    await expect(
      setMoodboardAccessGrant(
        actor,
        "board",
        "outsider",
        MoodboardAccessRole.EDITOR
      )
    ).rejects.toMatchObject({ code: "WORKSPACE_MEMBER_REQUIRED", status: 403 });
    expect(prisma.moodboardAccessGrant.upsert).not.toHaveBeenCalled();
  });

  it("stores a direct role only for a current workspace member, and moves Date updated", async () => {
    memberFindUnique.mockResolvedValue({ userId: "member" });
    grantUpsert.mockResolvedValue({
      userId: "member",
      role: MoodboardAccessRole.VIEWER,
    });

    await setMoodboardAccessGrant(
      actor,
      "board",
      "member",
      MoodboardAccessRole.VIEWER
    );

    expect(prisma.workspaceMember.findUnique).toHaveBeenCalledWith({
      where: {
        workspaceId_userId: {
          workspaceId: "workspace",
          userId: "member",
        },
      },
      select: { userId: true },
    });
    expect(prisma.moodboardAccessGrant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          moodboardId: "board",
          userId: "member",
          role: MoodboardAccessRole.VIEWER,
          grantedById: "owner",
        }),
      })
    );
    expect(prisma.moodboard.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "board" } })
    );
  });

  describe("invite by email", () => {
    it("finds a workspace member by email, ignoring case, and gives the role", async () => {
      memberFindFirst.mockResolvedValue({ userId: "lena" });
      memberFindUnique.mockResolvedValue({ userId: "lena" });
      grantUpsert.mockResolvedValue({ userId: "lena", role: "EDITOR" });
      await inviteMoodboardMember(
        actor,
        "board",
        " Lena@Studio.CH ",
        MoodboardAccessRole.EDITOR
      );
      expect(memberFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId: "workspace",
            user: { email: { equals: "Lena@Studio.CH", mode: "insensitive" } },
          },
        })
      );
      expect(grantUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ userId: "lena", role: "EDITOR" }),
        })
      );
    });

    it("answers for an address outside the workspace without creating anything", async () => {
      memberFindFirst.mockResolvedValue(null);
      await expect(
        inviteMoodboardMember(
          actor,
          "board",
          "x@elsewhere.io",
          MoodboardAccessRole.VIEWER
        )
      ).rejects.toMatchObject({
        code: "WORKSPACE_MEMBER_REQUIRED",
        status: 403,
      });
      expect(grantUpsert).not.toHaveBeenCalled();
    });
  });

  describe("removing", () => {
    it("keeps the creator's Full Access fixed", async () => {
      await expect(
        removeMoodboardAccessGrant(actor, "board", "owner")
      ).rejects.toMatchObject({
        code: "MOODBOARD_CREATOR_ACCESS_FIXED",
        status: 403,
      });
      expect(prisma.moodboardAccessGrant.deleteMany).not.toHaveBeenCalled();
    });

    it("lets full access remove someone else", async () => {
      await removeMoodboardAccessGrant(actor, "board", "m1");
      expect(prisma.moodboardAccessGrant.deleteMany).toHaveBeenCalledWith({
        where: { moodboardId: "board", userId: "m1" },
      });
    });

    it("lets anyone on the board take themselves off (Leave board)", async () => {
      actAs(MoodboardAccessRole.VIEWER);
      await removeMoodboardAccessGrant(viewer, "board", "viewer");
      expect(prisma.moodboardAccessGrant.deleteMany).toHaveBeenCalledWith({
        where: { moodboardId: "board", userId: "viewer" },
      });
    });

    it("does not let a stranger leave a board they cannot see", async () => {
      actAs(null);
      await expect(
        removeMoodboardAccessGrant(viewer, "board", "viewer")
      ).rejects.toMatchObject({ code: "MOODBOARD_NOT_FOUND" });
      expect(prisma.moodboardAccessGrant.deleteMany).not.toHaveBeenCalled();
    });
  });
});
