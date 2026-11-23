import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { resolveWorkspaceAccess } from "@/lib/auth/workspace-auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { setTtlCachesEnabled } from "@/lib/ttl-cache";

jest.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: jest.fn() }));
jest.mock("@/lib/entitlements", () => ({ getPlan: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspace: { findUnique: jest.fn(), createMany: jest.fn() },
    workspaceMember: { upsert: jest.fn(), findUnique: jest.fn() },
  },
}));

const user = prisma.user.findUnique as jest.Mock;
const workspace = prisma.workspace.findUnique as jest.Mock;
const memberFind = prisma.workspaceMember.findUnique as jest.Mock;
const memberUpsert = prisma.workspaceMember.upsert as jest.Mock;

describe("workspace access, warm path", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setTtlCachesEnabled(true);
    user.mockResolvedValue({ id: "u1", isActive: true });
    workspace.mockResolvedValue({ id: "ws-1", kind: WorkspaceKind.PERSONAL });
    memberFind.mockResolvedValue({ role: WorkspaceRole.OWNER });
    memberUpsert.mockResolvedValue({ role: WorkspaceRole.OWNER });
    jest.mocked(isFeatureEnabled).mockResolvedValue(true);
  });
  afterEach(() => setTtlCachesEnabled(false));

  it("looks the personal workspace up once, then only checks user and membership", async () => {
    const first = await resolveWorkspaceAccess({ userId: "u1" });
    const second = await resolveWorkspaceAccess({ userId: "u1" });

    expect(first.workspaceId).toBe("ws-1");
    expect(second).toEqual(first);
    expect(workspace).toHaveBeenCalledTimes(1);
    expect(user).toHaveBeenCalledTimes(2);
    expect(memberFind).toHaveBeenCalledTimes(2);
  });

  it("does not write when the owner membership already exists", async () => {
    await resolveWorkspaceAccess({ userId: "u1" });
    await resolveWorkspaceAccess({ userId: "u1" });
    expect(memberUpsert).not.toHaveBeenCalled();
  });

  it("creates the membership when it is missing, or repairs a wrong role", async () => {
    memberFind.mockResolvedValueOnce(null);
    await resolveWorkspaceAccess({ userId: "u1" });
    expect(memberUpsert).toHaveBeenCalledTimes(1);

    memberFind.mockResolvedValueOnce({ role: WorkspaceRole.EDITOR });
    await resolveWorkspaceAccess({ userId: "u1" });
    expect(memberUpsert).toHaveBeenCalledTimes(2);
  });

  it("still refuses a user who was deactivated after the workspace was cached", async () => {
    await resolveWorkspaceAccess({ userId: "u1" });
    user.mockResolvedValue({ id: "u1", isActive: false });

    await expect(
      resolveWorkspaceAccess({ userId: "u1" })
    ).rejects.toMatchObject({
      status: 401,
      code: "AUTHENTICATED_USER_NOT_FOUND",
    });
    expect(memberUpsert).not.toHaveBeenCalled();
  });

  it("refuses a deactivated user without creating anything on a cold cache", async () => {
    user.mockResolvedValue({ id: "u2", isActive: false });
    workspace.mockResolvedValue(null);

    await expect(
      resolveWorkspaceAccess({ userId: "u2" })
    ).rejects.toMatchObject({ status: 401 });
    expect(prisma.workspace.createMany).not.toHaveBeenCalled();
    expect(memberUpsert).not.toHaveBeenCalled();
  });

  it("runs the independent reads together", async () => {
    const started: string[] = [];
    const slow = <T>(name: string, value: T) =>
      jest.fn(async () => {
        started.push(name);
        await new Promise((resolve) => setTimeout(resolve, 5));
        return value;
      });
    user.mockImplementation(slow("user", { id: "u3", isActive: true }));
    workspace.mockImplementation(
      slow("workspace", { id: "ws-3", kind: WorkspaceKind.PERSONAL })
    );
    jest
      .mocked(isFeatureEnabled)
      .mockImplementation(slow("flag", true) as never);

    await resolveWorkspaceAccess({ userId: "u3" });
    expect(started.slice(0, 3).sort()).toEqual(["flag", "user", "workspace"]);
  });

  it("keeps two users apart with a warm cache", async () => {
    workspace.mockImplementation(
      async (args: { where: { personalOwnerId: string } }) =>
        args.where.personalOwnerId === "u1"
          ? { id: "ws-1", kind: WorkspaceKind.PERSONAL }
          : { id: "ws-2", kind: WorkspaceKind.PERSONAL }
    );
    user.mockImplementation(async (args: { where: { id: string } }) => ({
      id: args.where.id,
      isActive: true,
    }));

    const first = await resolveWorkspaceAccess({ userId: "u1" });
    const other = await resolveWorkspaceAccess({ userId: "u2" });
    const again = await resolveWorkspaceAccess({ userId: "u1" });

    expect(first.workspaceId).toBe("ws-1");
    expect(other.workspaceId).toBe("ws-2");
    expect(again.workspaceId).toBe("ws-1");
    expect(workspace).toHaveBeenCalledTimes(2);
    // The membership is always looked up in the cached workspace of that user.
    expect(memberFind).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { workspaceId_userId: { workspaceId: "ws-1", userId: "u1" } },
      })
    );
  });

  it("does not grant a stale cached workspace after it was recreated", async () => {
    await resolveWorkspaceAccess({ userId: "u1" }); // caches ws-1

    // The workspace was deleted (its membership went with it) and recreated.
    workspace.mockResolvedValue({ id: "ws-new", kind: WorkspaceKind.PERSONAL });
    memberFind.mockImplementation(
      async (args: {
        where: { workspaceId_userId: { workspaceId: string } };
      }) =>
        args.where.workspaceId_userId.workspaceId === "ws-new"
          ? { role: WorkspaceRole.OWNER }
          : null
    );

    const healed = await resolveWorkspaceAccess({ userId: "u1" });
    expect(healed.workspaceId).toBe("ws-new");
    expect(healed.dataScope).toEqual({
      mode: "workspace",
      workspaceId: "ws-new",
    });

    // The next call caches the new one; the one after reads it from the cache.
    expect((await resolveWorkspaceAccess({ userId: "u1" })).workspaceId).toBe(
      "ws-new"
    );
    workspace.mockClear();
    expect((await resolveWorkspaceAccess({ userId: "u1" })).workspaceId).toBe(
      "ws-new"
    );
    expect(workspace).not.toHaveBeenCalled();
  });
});
