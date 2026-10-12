import {
  getPage,
  listPages,
  restorePage,
  updatePage,
} from "@/services/pages/page-service";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

const describeIntegration =
  process.env.PAGE_TRASH_INTEGRATION === "1" ? describe : describe.skip;

const runId = `trash${Date.now().toString(36)}`;
const id = (name: string) => `${runId}-${name}`;

function actor(userId: string, workspaceId: string, role: WorkspaceRole) {
  const workspace: WorkspaceAccess = {
    enabled: true,
    workspaceId,
    workspaceKind: WorkspaceKind.SHARED,
    role,
    dataScope: { mode: "workspace", workspaceId },
  };
  return { userId, workspace };
}

describeIntegration("page trash and restore (real database)", () => {
  const owner = actor(id("owner"), id("ws"), WorkspaceRole.OWNER);
  const viewer = actor(id("viewer"), id("ws"), WorkspaceRole.VIEWER);
  const outsider = actor(id("outsider"), id("other-ws"), WorkspaceRole.OWNER);

  beforeAll(async () => {
    await prisma.user.createMany({
      data: ["owner", "viewer", "outsider"].map((name) => ({
        id: id(name),
        email: `${id(name)}@example.test`,
      })),
    });
    await prisma.workspace.createMany({
      data: [
        { id: id("ws"), name: "Team", kind: WorkspaceKind.SHARED },
        { id: id("other-ws"), name: "Other", kind: WorkspaceKind.SHARED },
      ],
    });
    await prisma.workspaceMember.createMany({
      data: [
        { workspaceId: id("ws"), userId: id("owner"), role: "OWNER" },
        { workspaceId: id("ws"), userId: id("viewer"), role: "VIEWER" },
        {
          workspaceId: id("other-ws"),
          userId: id("outsider"),
          role: "OWNER",
        },
      ],
    });
    await prisma.page.create({
      data: {
        id: id("parent"),
        userId: id("owner"),
        workspaceId: id("ws"),
        title: "Parent",
        blocks: {
          create: { type: "PARAGRAPH", content: { text: "body" }, position: 1 },
        },
        assets: {
          create: {
            userId: id("owner"),
            originalName: "a.png",
            mimeType: "image/png",
            size: 3,
            bytes: Buffer.from([1, 2, 3]),
          },
        },
      },
    });
    await prisma.page.create({
      data: {
        id: id("child"),
        userId: id("owner"),
        workspaceId: id("ws"),
        parentId: id("parent"),
        title: "Child",
      },
    });
  });

  afterAll(async () => {
    await prisma.page.deleteMany({ where: { id: { startsWith: runId } } });
    await prisma.workspace.deleteMany({ where: { id: { startsWith: runId } } });
    await prisma.user.deleteMany({ where: { id: { startsWith: runId } } });
    await prisma.$disconnect();
  });

  it("trashes, lists the trash, and restores with children and assets", async () => {
    await expect(
      updatePage(owner, id("parent"), { trashed: true })
    ).resolves.not.toBeNull();
    await expect(getPage(owner, id("parent"))).resolves.toBeNull();

    const trash = await listPages(owner, { trashed: true });
    expect(trash.map((page) => page.id)).toContain(id("parent"));
    const live = await listPages(owner);
    expect(live.map((page) => page.id)).not.toContain(id("parent"));

    const restored = await updatePage(owner, id("parent"), { trashed: false });

    expect(restored?.id).toBe(id("parent"));
    expect(restored?.children.map((child) => child.id)).toEqual([id("child")]);
    expect(restored?.blocks).toHaveLength(1);
    await expect(
      prisma.pageAsset.count({ where: { pageId: id("parent") } })
    ).resolves.toBe(1);
    await expect(getPage(owner, id("parent"))).resolves.not.toBeNull();
  });

  it("restoring twice is a no-op", async () => {
    await updatePage(owner, id("parent"), { trashed: true });
    await restorePage(owner, id("parent"));
    const before = await prisma.page.findUniqueOrThrow({
      where: { id: id("parent") },
      select: { updatedAt: true, trashedAt: true },
    });

    await expect(restorePage(owner, id("parent"))).resolves.not.toBeNull();

    const after = await prisma.page.findUniqueOrThrow({
      where: { id: id("parent") },
      select: { updatedAt: true, trashedAt: true },
    });
    expect(after).toEqual(before);
    expect(after.trashedAt).toBeNull();
  });

  it("a workspace viewer cannot restore", async () => {
    await updatePage(owner, id("parent"), { trashed: true });

    await expect(restorePage(viewer, id("parent"))).resolves.toBeNull();
    await expect(
      updatePage(viewer, id("parent"), { trashed: false })
    ).resolves.toBeNull();
    const row = await prisma.page.findUniqueOrThrow({
      where: { id: id("parent") },
      select: { trashedAt: true },
    });
    expect(row.trashedAt).not.toBeNull();

    await restorePage(owner, id("parent"));
  });

  it("a page from another workspace is not found", async () => {
    await updatePage(owner, id("parent"), { trashed: true });

    await expect(restorePage(outsider, id("parent"))).resolves.toBeNull();
    const trash = await listPages(outsider, { trashed: true });
    expect(trash.map((page) => page.id)).not.toContain(id("parent"));

    await restorePage(owner, id("parent"));
  });

  it("a child whose parent is still in the trash comes back at the top level", async () => {
    await updatePage(owner, id("child"), { trashed: true });
    await updatePage(owner, id("parent"), { trashed: true });

    const child = await restorePage(owner, id("child"));

    expect(child?.parentId).toBeNull();
    await restorePage(owner, id("parent"));
  });

  it("applies other changes sent with the restore", async () => {
    await updatePage(owner, id("parent"), { trashed: true });

    const page = await updatePage(owner, id("parent"), {
      trashed: false,
      title: "Parent again",
    });

    expect(page?.title).toBe("Parent again");
  });
});
