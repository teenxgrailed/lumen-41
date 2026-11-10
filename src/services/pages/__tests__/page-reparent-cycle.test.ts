import { updatePage } from "@/services/pages/page-service";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/services/pages/page-model", () => ({
  ...jest.requireActual("@/services/pages/page-model"),
  pageActorCanAccess: jest.fn().mockResolvedValue({ id: "ok" }),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    page: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const workspace: WorkspaceAccess = {
  enabled: true,
  workspaceId: "ws",
  workspaceKind: WorkspaceKind.SHARED,
  role: WorkspaceRole.EDITOR,
  dataScope: { mode: "workspace", workspaceId: "ws" },
};
const actor = { userId: "u", workspace };

// A is the parent of B, B is the parent of C.
const parents: Record<string, string | null> = {
  A: null,
  B: "A",
  C: "B",
  X: null,
};

describe("updatePage re-parenting", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.page.findFirst as jest.Mock).mockResolvedValue({ id: "A" });
    (prisma.page.findUnique as jest.Mock).mockImplementation(
      async ({ where }: { where: { id: string } }) => ({
        parentId: parents[where.id] ?? null,
      })
    );
    (prisma.page.update as jest.Mock).mockResolvedValue({ id: "A" });
  });

  it("rejects moving a page under its own child", async () => {
    await expect(updatePage(actor, "A", { parentId: "B" })).rejects.toThrow(
      "A page cannot contain itself"
    );
    expect(prisma.page.update).not.toHaveBeenCalled();
  });

  it("rejects moving a page under a deeper descendant", async () => {
    await expect(updatePage(actor, "A", { parentId: "C" })).rejects.toThrow(
      "A page cannot contain itself"
    );
  });

  it("allows an unrelated parent", async () => {
    await updatePage(actor, "C", { parentId: "X" });
    expect(prisma.page.update).toHaveBeenCalled();
  });
});
