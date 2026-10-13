import {
  getPublicMoodboard,
  listMoodboards,
  moodboardLinkToken,
  moodboardLinkTokenValid,
  parseMoodboardSort,
  readPublicMoodboardAsset,
} from "@/services/moodboards/moodboard-service";

jest.mock("@/lib/auth/moodboard-auth", () => ({
  resolveMoodboardAccess: jest.fn(),
  inheritedMoodboardRole: (role: string) =>
    role === "OWNER" ? "FULL_ACCESS" : role === "EDITOR" ? "EDITOR" : "VIEWER",
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    moodboard: { findMany: jest.fn(), findFirst: jest.fn() },
    moodboardItem: { findMany: jest.fn(), findFirst: jest.fn() },
    moodboardAsset: { findFirst: jest.fn() },
  },
}));

const { prisma } = jest.requireMock<{
  prisma: {
    moodboard: { findMany: jest.Mock; findFirst: jest.Mock };
    moodboardItem: { findMany: jest.Mock; findFirst: jest.Mock };
    moodboardAsset: { findFirst: jest.Mock };
  };
}>("@/lib/prisma");

const actor = {
  userId: "u1",
  workspace: { workspaceId: "w1", role: "EDITOR" },
} as unknown as Parameters<typeof listMoodboards>[0];

const row = (id: string, title: string, extra = {}) => ({
  id,
  title,
  createdById: "u1",
  _count: { items: 0 },
  items: [],
  createdBy: { id: "u1", name: "Me", email: "me@x.io" },
  accessGrants: [],
  collaborationState: null,
  ...extra,
});

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

  it("does not read the old canvas's bytes, only whether it exists", async () => {
    prisma.moodboard.findMany.mockResolvedValue([]);
    await listMoodboards(actor);
    const { select } = prisma.moodboard.findMany.mock.calls[0][0];
    expect(select.collaborationState).toEqual({ select: { id: true } });
  });

  it("flattens the relation into itemCount and preview, and cuts a long note", async () => {
    prisma.moodboard.findMany.mockResolvedValue([
      row("b1", "Moods", {
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
      }),
    ]);
    const [board] = await listMoodboards(actor);
    expect(board).not.toHaveProperty("_count");
    expect(board).not.toHaveProperty("items");
    expect(board.itemCount).toBe(9);
    expect(board.preview).toHaveLength(1);
    expect(board.preview[0].text).toHaveLength(120);
  });

  it("says who made it, who else is on it, and the caller's own role", async () => {
    prisma.moodboard.findMany.mockResolvedValue([
      row("mine", "Mine", {
        accessGrants: [
          {
            userId: "u2",
            role: "VIEWER",
            user: { name: "Lena", email: "l@x.io", image: null },
          },
        ],
      }),
      row("theirs", "Theirs", {
        createdById: "u9",
        createdBy: { id: "u9", name: "Tom", email: "t@x.io" },
        accessGrants: [
          {
            userId: "u1",
            role: "VIEWER",
            user: { name: "Me", email: "me@x.io", image: null },
          },
        ],
      }),
      row("workspace", "Open", { createdById: "u9", createdBy: null }),
    ]);
    const [mine, theirs, open] = await listMoodboards(actor);
    expect(mine).toMatchObject({ accessRole: "FULL_ACCESS", memberCount: 1 });
    expect(mine.members[0]).toMatchObject({ name: "Lena", role: "VIEWER" });
    expect(theirs).toMatchObject({
      accessRole: "VIEWER",
      owner: { name: "Tom" },
    });
    // no grant and not the maker: what the workspace role gives (EDITOR here)
    expect(open.accessRole).toBe("EDITOR");
  });

  it("marks a board whose old canvas stored something", async () => {
    prisma.moodboard.findMany.mockResolvedValue([
      row("c", "Canvas", { collaborationState: { id: "s" } }),
      row("n", "None"),
    ]);
    const [c, n] = await listMoodboards(actor);
    expect(c.hasCanvas).toBe(true);
    expect(n.hasCanvas).toBe(false);
  });

  it("is empty without a workspace", async () => {
    expect(
      await listMoodboards({ userId: "u1", workspace: null } as never)
    ).toEqual([]);
    expect(prisma.moodboard.findMany).not.toHaveBeenCalled();
  });
});

describe("the list's sort is the server's", () => {
  beforeEach(() => prisma.moodboard.findMany.mockReset());
  const orderOf = async (sort: Parameters<typeof listMoodboards>[1]) => {
    prisma.moodboard.findMany.mockResolvedValue([]);
    await listMoodboards(actor, sort);
    return prisma.moodboard.findMany.mock.calls.at(-1)?.[0].orderBy;
  };

  it("defaults to Date updated, newest first", async () => {
    expect(await orderOf(undefined)).toEqual({ updatedAt: "desc" });
  });

  it("orders by Date created and Date updated in the database, either way", async () => {
    expect(await orderOf({ key: "created", dir: "asc" })).toEqual({
      createdAt: "asc",
    });
    expect(await orderOf({ key: "updated", dir: "asc" })).toEqual({
      updatedAt: "asc",
    });
  });

  it("orders by Name case-insensitively, A to Z or back", async () => {
    prisma.moodboard.findMany.mockResolvedValue([
      row("1", "banana"),
      row("2", "Apple"),
      row("3", "cherry"),
    ]);
    expect(
      (await listMoodboards(actor, { key: "name", dir: "asc" })).map(
        (b) => b.title
      )
    ).toEqual(["Apple", "banana", "cherry"]);
    expect(
      (await listMoodboards(actor, { key: "name", dir: "desc" })).map(
        (b) => b.title
      )
    ).toEqual(["cherry", "banana", "Apple"]);
  });

  it("reads ?sort and ?dir, and anything else is the default", () => {
    expect(parseMoodboardSort("name", null)).toEqual({
      key: "name",
      dir: "asc",
    });
    expect(parseMoodboardSort("created", null)).toEqual({
      key: "created",
      dir: "desc",
    });
    expect(parseMoodboardSort("created", "asc")).toEqual({
      key: "created",
      dir: "asc",
    });
    expect(parseMoodboardSort("title; drop", "sideways")).toEqual({
      key: "updated",
      dir: "desc",
    });
    expect(parseMoodboardSort(null, null)).toEqual({
      key: "updated",
      dir: "desc",
    });
  });
});

describe("Anyone with the link", () => {
  beforeEach(() => {
    prisma.moodboard.findFirst.mockReset();
    prisma.moodboardItem.findMany.mockReset();
    prisma.moodboardItem.findFirst.mockReset();
    prisma.moodboardAsset.findFirst.mockReset();
  });
  const board = (version = 0) => ({
    id: "b1",
    title: "Rooms",
    linkTokenVersion: version,
  });

  it("makes a token that belongs to one board and one version, and only that", () => {
    const t = moodboardLinkToken("board-a", 0);
    expect(t).toHaveLength(32);
    expect(moodboardLinkTokenValid("board-a", 0, t)).toBe(true);
    expect(moodboardLinkTokenValid("board-b", 0, t)).toBe(false);
    expect(moodboardLinkTokenValid("board-a", 1, t)).toBe(false);
    expect(moodboardLinkTokenValid("board-a", 0, t.slice(0, 31) + "x")).toBe(
      false
    );
    expect(moodboardLinkTokenValid("board-a", 0, "")).toBe(false);
    expect(moodboardLinkToken("board-a", 1)).not.toBe(t);
  });

  it("an address shared before sharing was turned off never works again, even after it is turned back on", async () => {
    const before = moodboardLinkToken("b1", 0);
    // sharing was off, then on again: the board's version moved to 1
    prisma.moodboard.findFirst.mockResolvedValue(board(1));
    prisma.moodboardItem.findMany.mockResolvedValue([]);
    expect(await getPublicMoodboard("b1", before)).toBeNull();
    expect(
      await getPublicMoodboard("b1", moodboardLinkToken("b1", 1))
    ).not.toBeNull();
    prisma.moodboardAsset.findFirst.mockResolvedValue({
      bytes: Buffer.from([1]),
      mimeType: "image/png",
    });
    prisma.moodboardItem.findFirst.mockResolvedValue({ id: "t" });
    expect(await readPublicMoodboardAsset("b1", before, "a1")).toBeNull();
  });

  it("opens a board only with the right token, only while sharing is on", async () => {
    const t = moodboardLinkToken("b1", 0);
    prisma.moodboard.findFirst.mockResolvedValue(board());
    prisma.moodboardItem.findMany.mockResolvedValue([
      {
        id: "i",
        kind: "note",
        url: null,
        color: null,
        text: "hi",
        title: null,
        ratio: 0.7,
        colorName: null,
        source: null,
        thumbnailUrl: null,
      },
    ]);
    expect(await getPublicMoodboard("b1", "wrong")).toBeNull();
    expect(prisma.moodboardItem.findMany).not.toHaveBeenCalled();
    const b = await getPublicMoodboard("b1", t);
    expect(b?.items).toHaveLength(1);
    // sharing off / in Trash / archived: the query itself excludes it
    expect(prisma.moodboard.findFirst.mock.calls.at(-1)?.[0].where).toEqual({
      id: "b1",
      linkShare: true,
      archivedAt: null,
      trashedAt: null,
    });
    prisma.moodboard.findFirst.mockResolvedValue(null);
    expect(await getPublicMoodboard("b1", t)).toBeNull();
  });

  it("sends only what a reader needs: the domain is derived from the address, never taken from the client", async () => {
    const t = moodboardLinkToken("b1", 0);
    prisma.moodboard.findFirst.mockResolvedValue(board());
    prisma.moodboardItem.findMany.mockResolvedValue([
      {
        id: "l",
        kind: "link",
        url: "https://www.are.na/block/1",
        color: null,
        text: null,
        title: "T",
        ratio: 0.7,
        colorName: null,
        thumbnailUrl: null,
        source: {
          name: "Are.na",
          domain: "bank.example.com",
          token: "secret",
          extra: 1,
        },
      },
      {
        id: "i",
        kind: "image",
        url: "/api/moodboards/b1/assets/a1",
        color: null,
        text: null,
        title: "Chair",
        ratio: 1.5,
        colorName: null,
        thumbnailUrl: null,
        source: { name: "x".repeat(500), domain: "evil.example" },
      },
    ]);
    const b = await getPublicMoodboard("b1", t);
    expect(b?.items[0].source).toEqual({ name: "Are.na", domain: "are.na" });
    expect(b?.items[1].url).toBe(`/api/public/moodboards/b1/${t}/assets/a1`);
    // an uploaded picture has no site: nothing client-supplied is passed on
    expect(b?.items[1].source).toEqual({ name: "x".repeat(120) });
    expect(
      Object.keys(prisma.moodboardItem.findMany.mock.calls[0][0].select)
    ).not.toContain("moodboardId");
  });

  it("serves a picture only while the board is shared, the token fits and a tile still shows it", async () => {
    const t = moodboardLinkToken("b1", 0);
    prisma.moodboard.findFirst.mockResolvedValue(null);
    expect(await readPublicMoodboardAsset("b1", t, "a1")).toBeNull();
    prisma.moodboard.findFirst.mockResolvedValue(board());
    prisma.moodboardAsset.findFirst.mockResolvedValue({
      bytes: Buffer.from([1, 2]),
      mimeType: "image/png",
    });
    prisma.moodboardItem.findFirst.mockResolvedValue(null); // the tile was removed
    expect(await readPublicMoodboardAsset("b1", t, "a1")).toBeNull();
    expect(prisma.moodboardAsset.findFirst).not.toHaveBeenCalled();
    prisma.moodboardItem.findFirst.mockResolvedValue({ id: "tile" });
    expect(await readPublicMoodboardAsset("b1", "bad", "a1")).toBeNull();
    expect((await readPublicMoodboardAsset("b1", t, "a1"))?.mimeType).toBe(
      "image/png"
    );
    expect(prisma.moodboardItem.findFirst.mock.calls.at(-1)?.[0].where).toEqual(
      {
        moodboardId: "b1",
        kind: "image",
        url: "/api/moodboards/b1/assets/a1",
      }
    );
  });
});
