import { listPages, pageShareFlags } from "@/services/pages/page-service";
import { WorkspaceRole } from "@prisma/client";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";

const findMany = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: { page: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

const row = (
  id: string,
  userId: string | null,
  grants: { role: string }[] = []
) => ({
  id,
  userId,
  isPrivate: false,
  accessGrants: grants,
});

describe("GET /api/pages share flags", () => {
  const actor = {
    userId: "me",
    workspace: {
      workspaceId: "w1",
      role: WorkspaceRole.EDITOR,
      dataScope: { mode: "workspace", workspaceId: "w1" },
    } as unknown as WorkspaceAccess,
  };

  it("marks only explicit grants on someone else's page as shared", async () => {
    findMany.mockResolvedValue([
      row("mine", "me"),
      row("mine-granted", "me", [{ role: "VIEWER" }]),
      row("inherited", "other"),
      row("granted", "other", [{ role: "EDITOR" }]),
      row("orphan", null),
    ]);
    const pages = await listPages(actor);
    const flags = Object.fromEntries(
      pages.map((p) => [p.id, [p.isOwner, p.sharedWithMe]])
    );
    expect(flags).toEqual({
      mine: [true, false],
      "mine-granted": [true, false],
      inherited: [false, false],
      granted: [false, true],
      orphan: [false, false],
    });
    // The fields the old UI reads are still there.
    expect(pages.find((p) => p.id === "inherited")?.accessRole).toBe("EDITOR");
  });

  it("a legacy string actor owns everything it lists", () => {
    expect(pageShareFlags("me", { userId: "me", accessGrants: [] })).toEqual({
      isOwner: true,
      sharedWithMe: false,
    });
  });
});
