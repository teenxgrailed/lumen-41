import { queryDatabase } from "@/services/pages/database-service";

import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: { pageDatabase: { findFirst: jest.fn() } },
}));

const record = (
  id: string,
  updatedAt: string,
  trashedAt: Date | null = null
) => ({
  id,
  pageId: `p-${id}`,
  position: 0,
  values: [],
  page: { id: `p-${id}`, title: id, updatedAt: new Date(updatedAt), trashedAt },
});

describe("queryDatabase", () => {
  beforeEach(() => {
    (prisma.pageDatabase.findFirst as jest.Mock).mockResolvedValue({
      id: "db",
      pageId: "p-db",
      properties: [],
      views: [],
      records: [
        // 2026-11-09 is a Monday, 2026-11-10 a Tuesday, 2026-11-08 a Sunday
        record("mon", "2026-11-09T10:00:00Z"),
        record("tue", "2026-11-10T10:00:00Z"),
        record("sun", "2026-11-08T10:00:00Z"),
        record("gone", "2026-11-11T10:00:00Z", new Date()),
      ],
    });
  });

  it("leaves trashed record pages out", async () => {
    const result = await queryDatabase("u", "db", {});
    expect(result?.map((r) => r.id).sort()).toEqual(["mon", "sun", "tue"]);
  });

  it("sorts by updatedAt chronologically, not by weekday name", async () => {
    const result = await queryDatabase("u", "db", {
      sort: [{ field: "updatedAt", direction: "asc" }],
    });
    expect(result?.map((r) => r.id)).toEqual(["sun", "mon", "tue"]);
  });
});
