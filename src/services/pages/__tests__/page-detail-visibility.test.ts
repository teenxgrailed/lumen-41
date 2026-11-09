import { pageDetailIncludeFor } from "@/services/pages/page-model";
import { getPage } from "@/services/pages/page-service";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: { page: { findFirst: jest.fn() } },
}));

type Row = {
  id: string;
  userId: string;
  workspaceId: string;
  isPrivate: boolean;
  trashedAt: Date | null;
  grants: string[];
};

// Evaluates the where clause the way Prisma would for the fields the
// visibility rule uses, so the test checks the rule and not its spelling.
function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") {
      return (value as Record<string, unknown>[]).some((w) => matches(row, w));
    }
    if (key === "accessGrants") {
      const userId = (value as { some: { userId: string } }).some.userId;
      return row.grants.includes(userId);
    }
    return (row as Record<string, unknown>)[key] === value;
  });
}

function actor(userId: string): { userId: string; workspace: WorkspaceAccess } {
  return {
    userId,
    workspace: {
      enabled: true,
      workspaceId: "ws",
      workspaceKind: WorkspaceKind.SHARED,
      role: WorkspaceRole.EDITOR,
      dataScope: { mode: "workspace", workspaceId: "ws" },
    },
  };
}

const row = (id: string, userId: string, isPrivate: boolean): Row => ({
  id,
  userId,
  workspaceId: "ws",
  isPrivate,
  trashedAt: null,
  grants: [],
});

const children = [
  row("shared-child", "owner", false),
  row("owner-private-child", "owner", true),
  row("member-private-child", "member", true),
  { ...row("granted-child", "owner", true), grants: ["member"] },
];

function visibleChildren(who: string) {
  const include = pageDetailIncludeFor(actor(who));
  return children
    .filter((c) => matches(c, include.children.where))
    .map((c) => c.id);
}

function visibleRecordPages(who: string) {
  const include = pageDetailIncludeFor(actor(who));
  const where = include.database.include.records.where.page;
  return children.filter((c) => matches(c, where)).map((c) => c.id);
}

describe("page detail payload visibility", () => {
  it("hides another member's private child page from a member", () => {
    expect(visibleChildren("member")).toEqual([
      "shared-child",
      "member-private-child",
      "granted-child",
    ]);
    expect(visibleChildren("member")).not.toContain("owner-private-child");
  });

  it("keeps the owner's own private children for the owner", () => {
    expect(visibleChildren("owner")).toEqual([
      "shared-child",
      "owner-private-child",
      "granted-child",
    ]);
    expect(visibleChildren("owner")).not.toContain("member-private-child");
  });

  it("filters database record pages by the same rule", () => {
    expect(visibleRecordPages("member")).not.toContain("owner-private-child");
    expect(visibleRecordPages("owner")).toContain("owner-private-child");
  });

  it("filters trashed children for every actor", () => {
    expect(pageDetailIncludeFor(actor("member")).children.where).toMatchObject({
      trashedAt: null,
    });
  });

  it("getPage loads the page with the actor-scoped include", async () => {
    (prisma.page.findFirst as jest.Mock).mockResolvedValue({ id: "p" });
    const member = actor("member");
    await getPage(member, "p");
    const call = (prisma.page.findFirst as jest.Mock).mock.calls[0][0];
    expect(call.include).toEqual(pageDetailIncludeFor(member));
    expect(call.include.children.where.OR).toBeDefined();
  });

  it("a legacy string actor only sees its own children", () => {
    expect(pageDetailIncludeFor("owner").children.where).toEqual({
      trashedAt: null,
      userId: "owner",
    });
  });
});
