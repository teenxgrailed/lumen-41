import { listMoodboards } from "@/services/moodboards/moodboard-service";

jest.mock("@/lib/auth/moodboard-auth", () => ({
  resolveMoodboardAccess: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: { moodboard: { findMany: jest.fn() } },
}));

const { prisma } = jest.requireMock<{
  prisma: { moodboard: { findMany: jest.Mock } };
}>("@/lib/prisma");

const actor = {
  userId: "u1",
  workspace: { workspaceId: "w1" },
} as unknown as Parameters<typeof listMoodboards>[0];

describe("listMoodboards", () => {
  beforeEach(() => prisma.moodboard.findMany.mockReset());

  it("asks for the count and the first three references in wall order, in one query", async () => {
    prisma.moodboard.findMany.mockResolvedValue([]);
    await listMoodboards(actor);
    expect(prisma.moodboard.findMany).toHaveBeenCalledTimes(1);
    const args = prisma.moodboard.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ workspaceId: "w1", archivedAt: null });
    expect(args.select._count).toEqual({ select: { items: true } });
    expect(args.select.items.take).toBe(3);
    expect(args.select.items.orderBy).toEqual([
      { position: "asc" },
      { createdAt: "asc" },
      { id: "asc" },
    ]);
    // only what a tile draws
    expect(Object.keys(args.select.items.select).sort()).toEqual(
      ["color", "id", "kind", "text", "thumbnailUrl", "url"].sort()
    );
  });

  it("flattens the relation into itemCount and preview, and cuts a long note", async () => {
    prisma.moodboard.findMany.mockResolvedValue([
      {
        id: "b1",
        title: "Moods",
        _count: { items: 9 },
        items: [
          {
            id: "i1",
            kind: "note",
            url: null,
            color: null,
            text: "x".repeat(500),
            thumbnailUrl: null,
          },
        ],
      },
    ]);
    const [board] = await listMoodboards(actor);
    expect(board).not.toHaveProperty("_count");
    expect(board).not.toHaveProperty("items");
    expect(board.itemCount).toBe(9);
    expect(board.preview).toHaveLength(1);
    expect(board.preview[0].text).toHaveLength(120);
  });

  it("is empty without a workspace", async () => {
    expect(
      await listMoodboards({ userId: "u1", workspace: null } as never)
    ).toEqual([]);
    expect(prisma.moodboard.findMany).not.toHaveBeenCalled();
  });
});
