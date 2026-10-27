import { ensurePersonalWorkspaceRow } from "@/lib/auth/personal-workspace";
import { ensureUserCustomization } from "@/lib/customization-db";
import { prisma } from "@/lib/prisma";

/** @jest-environment node */
jest.mock("@/lib/prisma", () => {
  const rows = new Map<string, Record<string, unknown>>();
  const model = (key: string) => ({
    findUnique: jest.fn(
      async ({ where }: { where: Record<string, string> }) => {
        await Promise.resolve();
        return rows.get(`${key}:${Object.values(where)[0]}`) ?? null;
      }
    ),
    createMany: jest.fn(
      async ({ data }: { data: Array<Record<string, string>> }) => {
        await Promise.resolve();
        let count = 0;
        for (const row of data) {
          const id = row.personalOwnerId ?? row.userId;
          const k = `${key}:${id}`;
          if (!rows.has(k)) {
            rows.set(k, { id: `row-${k}`, kind: "PERSONAL", ...row });
            count += 1;
          }
        }
        return { count };
      }
    ),
  });
  return {
    prisma: {
      workspace: model("workspace"),
      userCustomization: model("custom"),
      __rows: rows,
    },
  };
});

const rows = (prisma as unknown as { __rows: Map<string, unknown> }).__rows;

describe("first-load ensure helpers", () => {
  beforeEach(() => rows.clear());

  it("creates one personal workspace for concurrent callers without throwing", async () => {
    const results = await Promise.all([
      ensurePersonalWorkspaceRow("u1"),
      ensurePersonalWorkspaceRow("u1"),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect([...rows.keys()].filter((k) => k.startsWith("workspace:"))).toEqual([
      "workspace:u1",
    ]);
  });

  it("creates one customization row for concurrent callers without throwing", async () => {
    const results = await Promise.all([
      ensureUserCustomization("u1"),
      ensureUserCustomization("u1"),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect([...rows.keys()].filter((k) => k.startsWith("custom:"))).toEqual([
      "custom:u1",
    ]);
  });

  it("survives a cross-process race where another writer got there first", async () => {
    const model = prisma.userCustomization as unknown as {
      findUnique: jest.Mock;
      createMany: jest.Mock;
    };
    model.findUnique.mockResolvedValueOnce(null);
    rows.set("custom:u2", { id: "other", userId: "u2" });
    const row = await ensureUserCustomization("u2");
    expect(row).toMatchObject({ id: "other" });
    expect(model.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
  });
});
