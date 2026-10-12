import { NextRequest, NextResponse } from "next/server";

import { GET as ASSET } from "@/app/api/moodboards/[id]/assets/[assetId]/route";
import { DELETE, PATCH } from "@/app/api/moodboards/[id]/items/[itemId]/route";
import {
  GET,
  POST,
  PATCH as REORDER,
} from "@/app/api/moodboards/[id]/items/route";
import { POST as UPLOAD } from "@/app/api/moodboards/[id]/items/upload/route";
import { MOODBOARD_ITEM_LIMIT } from "@/services/moodboards/moodboard-item-service";
import { unfurlLink } from "@/services/moodboards/unfurl";
import {
  MoodboardAccessRole,
  WorkspaceKind,
  WorkspaceRole,
} from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";

/*
 * The real access resolver (`@/lib/auth/moodboard-auth`) runs against an
 * in-memory Prisma, so the matrix below is the one production applies:
 * creator / workspace owner / editor write, viewer reads, anyone outside the
 * board's workspace gets the same 403 as `/api/moodboards/[id]`.
 */

type Board = {
  id: string;
  workspaceId: string;
  createdById: string;
  archivedAt: Date | null;
  grants: { userId: string; role: MoodboardAccessRole }[];
};
type Item = {
  id: string;
  moodboardId: string;
  kind: string;
  url: string | null;
  color: string | null;
  text: string | null;
  title: string | null;
  ratio: number | null;
  colorName: string | null;
  source: unknown;
  thumbnailUrl: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  secretStorageKey?: string;
};

const db: {
  boards: Board[];
  items: Item[];
  assets: {
    id: string;
    moodboardId: string;
    bytes?: Buffer;
    mimeType?: string;
  }[];
  seq: number;
} = {
  boards: [],
  items: [],
  assets: [],
  seq: 0,
};

function matches(row: Record<string, unknown>, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function sortItems(rows: Item[], order: Record<string, "asc" | "desc">[]) {
  return [...rows].sort((a, b) => {
    for (const clause of order) {
      const [key, dir] = Object.entries(clause)[0] as [keyof Item, string];
      const av = a[key] as number | string | Date;
      const bv = b[key] as number | string | Date;
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
    }
    return 0;
  });
}

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
/* The old canvas's tiles and the page preview have their own tests. */
const mockCanvas = jest.fn();
jest.mock("@/services/moodboards/moodboard-canvas", () => ({
  readCanvasProjection: (...a: unknown[]) => mockCanvas(...a),
}));
jest.mock("@/services/moodboards/unfurl", () => ({ unfurlLink: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/prisma", () => {
  const prisma: Record<string, unknown> = {
    // Filled in beforeEach: returns only the caller's own grant.
    moodboard: { findFirst: jest.fn(), update: jest.fn(async () => ({})) },
    moodboardAsset: {
      count: jest.fn(async () => db.assets.length),
      create: jest.fn(async ({ data }: { data: { moodboardId: string } }) => {
        db.seq += 1;
        const row = { id: `asset-${db.seq}`, ...data };
        db.assets.push(row as never);
        return row;
      }),
      findFirst: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          db.assets.find((a) =>
            matches(a as unknown as Record<string, unknown>, where)
          ) ?? null
      ),
    },
    moodboardItem: {
      findMany: jest.fn(
        async ({
          where,
          orderBy,
        }: {
          where: Record<string, unknown>;
          orderBy: Record<string, "asc" | "desc">[];
        }) =>
          sortItems(
            db.items.filter((i) =>
              matches(i as unknown as Record<string, unknown>, where)
            ),
            orderBy
          )
      ),
      findFirst: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          db.items.find((i) =>
            matches(i as unknown as Record<string, unknown>, where)
          ) ?? null
      ),
      count: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          db.items.filter((i) =>
            matches(i as unknown as Record<string, unknown>, where)
          ).length
      ),
      aggregate: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) => {
          const rows = db.items.filter((i) =>
            matches(i as unknown as Record<string, unknown>, where)
          );
          return {
            _max: {
              position: rows.length
                ? Math.max(...rows.map((r) => r.position))
                : null,
            },
          };
        }
      ),
      create: jest.fn(async ({ data }: { data: Partial<Item> }) => {
        db.seq += 1;
        const now = new Date(Date.UTC(2026, 9, 12, 10, db.seq));
        const row: Item = {
          id: `new-${db.seq}`,
          url: null,
          color: null,
          text: null,
          title: null,
          ratio: null,
          colorName: null,
          source: null,
          thumbnailUrl: null,
          position: 0,
          createdAt: now,
          updatedAt: now,
          moodboardId: "",
          kind: "",
          ...data,
        };
        db.items.push(row);
        return row;
      }),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: object }) => {
          const row = db.items.find((i) => i.id === where.id);
          if (!row) throw new Error("Record not found");
          // Prisma stores DbNull as SQL NULL and reads it back as null.
          const { Prisma } = jest.requireActual("@prisma/client");
          for (const [key, value] of Object.entries(data)) {
            (row as Record<string, unknown>)[key] =
              value === Prisma.DbNull ? null : value;
          }
          return row;
        }
      ),
      deleteMany: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) => {
          const before = db.items.length;
          db.items = db.items.filter(
            (i) => !matches(i as unknown as Record<string, unknown>, where)
          );
          return { count: before - db.items.length };
        }
      ),
    },
  };
  prisma.$transaction = jest.fn(
    async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)
  );
  return { prisma };
});

const { prisma } =
  jest.requireMock<typeof import("@/lib/prisma")>("@/lib/prisma");
const authenticate = authenticateRequest as jest.Mock;

function workspace(workspaceId: string, role: WorkspaceRole) {
  return {
    enabled: true,
    workspaceId,
    workspaceKind: WorkspaceKind.SHARED,
    role,
    dataScope: { mode: "workspace" as const, workspaceId },
  };
}

const ACTORS = {
  creator: { userId: "creator", workspace: workspace("ws-a", "VIEWER") },
  owner: { userId: "owner", workspace: workspace("ws-a", "OWNER") },
  editor: { userId: "editor", workspace: workspace("ws-a", "EDITOR") },
  viewer: { userId: "viewer", workspace: workspace("ws-a", "VIEWER") },
  grantedViewer: { userId: "granted", workspace: workspace("ws-a", "EDITOR") },
  outsider: { userId: "outsider", workspace: workspace("ws-b", "OWNER") },
  /* Removed from ws-a: with no workspace header they land in their own. */
  removedFallback: {
    userId: "removed",
    workspace: workspace("personal-removed", "OWNER"),
  },
} as const;
type ActorName = keyof typeof ACTORS | "removedNamed";

function as(actor: ActorName) {
  if (actor === "removedNamed") {
    authenticate.mockResolvedValue({
      response: NextResponse.json(
        { error: "Not a member", code: "WORKSPACE_MEMBERSHIP_REQUIRED" },
        { status: 403 }
      ),
    });
    return;
  }
  authenticate.mockResolvedValue(ACTORS[actor]);
}

function item(p: Partial<Item> & { id: string; moodboardId: string }): Item {
  return {
    kind: "note",
    url: null,
    color: null,
    text: "note",
    title: null,
    ratio: null,
    colorName: null,
    source: null,
    thumbnailUrl: null,
    position: 0,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    ...p,
  };
}

function request(path: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  });
}

/** Route handlers are typed as possibly returning nothing; these always answer. */
async function must(pending: Promise<Response | undefined | void>) {
  const response = await pending;
  if (!response) throw new Error("Expected a route response");
  return response;
}

const list = (board = "board-a") =>
  must(
    GET(request(`/api/moodboards/${board}/items`, "GET"), {
      params: Promise.resolve({ id: board }),
    })
  );
const create = (body: unknown, board = "board-a") =>
  must(
    POST(request(`/api/moodboards/${board}/items`, "POST", body), {
      params: Promise.resolve({ id: board }),
    })
  );
const patch = (itemId: string, body: unknown, board = "board-a") =>
  must(
    PATCH(request(`/api/moodboards/${board}/items/${itemId}`, "PATCH", body), {
      params: Promise.resolve({ id: board, itemId }),
    })
  );
const remove = (itemId: string, board = "board-a") =>
  must(
    DELETE(request(`/api/moodboards/${board}/items/${itemId}`, "DELETE"), {
      params: Promise.resolve({ id: board, itemId }),
    })
  );

beforeEach(() => {
  jest.clearAllMocks();
  db.seq = 0;
  db.assets = [];
  mockCanvas.mockResolvedValue({ items: [], skipped: 0 });
  (unfurlLink as jest.Mock).mockResolvedValue(null);
  db.boards = [
    {
      id: "board-a",
      workspaceId: "ws-a",
      createdById: "creator",
      archivedAt: null,
      grants: [{ userId: "granted", role: MoodboardAccessRole.VIEWER }],
    },
    {
      id: "board-b",
      workspaceId: "ws-b",
      createdById: "outsider",
      archivedAt: null,
      grants: [],
    },
  ];
  db.items = [
    item({
      id: "a-late",
      moodboardId: "board-a",
      position: 2,
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
    }),
    item({
      id: "a-tie-2",
      moodboardId: "board-a",
      position: 1,
      createdAt: new Date("2026-10-03T00:00:00.000Z"),
    }),
    item({
      id: "a-tie-1",
      moodboardId: "board-a",
      kind: "image",
      url: "https://images.example.com/chair.jpg",
      text: null,
      title: "Chair",
      ratio: 1.5,
      source: { name: "Example", domain: "example.com", token: "x" },
      position: 1,
      createdAt: new Date("2026-10-02T00:00:00.000Z"),
      secretStorageKey: "s3://internal/key",
    }),
    item({ id: "b-only", moodboardId: "board-b", position: 1 }),
  ];
  (prisma.moodboard.findFirst as jest.Mock).mockImplementation(
    async ({
      where,
      select,
    }: {
      where: Record<string, unknown>;
      select: { accessGrants: { where: { userId: string } } };
    }) => {
      const board = db.boards.find((b) =>
        matches(b as unknown as Record<string, unknown>, where)
      );
      if (!board) return null;
      return {
        id: board.id,
        createdById: board.createdById,
        workspaceId: board.workspaceId,
        accessGrants: board.grants
          .filter((g) => g.userId === select.accessGrants.where.userId)
          .map((g) => ({ role: g.role })),
      };
    }
  );
});

describe("GET /api/moodboards/:id/items", () => {
  it.each(["creator", "owner", "editor", "viewer", "grantedViewer"] as const)(
    "lists the wall for %s in position, createdAt, id order",
    async (actor) => {
      as(actor);
      const response = await list();
      expect(response.status).toBe(200);
      const { items } = await response.json();
      expect(items.map((i: { id: string }) => i.id)).toEqual([
        "a-tie-1",
        "a-tie-2",
        "a-late",
      ]);
    }
  );

  it("reads at most the item limit", async () => {
    as("viewer");
    await list();
    expect(prisma.moodboardItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: MOODBOARD_ITEM_LIMIT })
    );
  });

  it("returns only public fields and a cleaned source", async () => {
    as("viewer");
    const { items } = await (await list()).json();
    expect(items[0]).toEqual({
      id: "a-tie-1",
      moodboardId: "board-a",
      kind: "image",
      url: "https://images.example.com/chair.jpg",
      color: null,
      text: null,
      title: "Chair",
      ratio: 1.5,
      colorName: null,
      source: { name: "Example", domain: "example.com" },
      thumbnailUrl: null,
      position: 1,
      createdAt: "2026-10-02T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    expect(JSON.stringify(items)).not.toContain("s3://internal");
  });

  it.each(["outsider", "removedFallback"] as const)(
    "answers %s like a guessed board id (403, nothing listed)",
    async (actor) => {
      as(actor);
      const response = await list();
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: "Moodboard access denied",
      });
      expect(prisma.moodboardItem.findMany).not.toHaveBeenCalled();
    }
  );

  it("gives the same 403 for a board id that does not exist", async () => {
    as("owner");
    const response = await list("board-nope");
    expect(response.status).toBe(403);
  });

  it("refuses a removed member who still names the workspace", async () => {
    as("removedNamed");
    const response = await list();
    expect(response.status).toBe(403);
    expect(prisma.moodboard.findFirst).not.toHaveBeenCalled();
  });

  it("does not show another workspace's board through its id", async () => {
    as("editor");
    const response = await list("board-b");
    expect(response.status).toBe(403);
  });

  it("hides an archived board", async () => {
    db.boards[0].archivedAt = new Date("2026-10-05T00:00:00.000Z");
    as("creator");
    expect((await list()).status).toBe(403);
  });
});

describe("POST /api/moodboards/:id/items", () => {
  it.each(["creator", "owner", "editor"] as const)(
    "lets %s add a reference at the end of the wall",
    async (actor) => {
      as(actor);
      const response = await create({
        kind: "color",
        color: "#c2410c",
        colorName: "Rust",
      });
      expect(response.status).toBe(201);
      const { item: created } = await response.json();
      expect(created).toEqual(
        expect.objectContaining({
          moodboardId: "board-a",
          kind: "color",
          color: "#c2410c",
          colorName: "Rust",
          position: 3,
        })
      );
    }
  );

  it("keeps an explicit position", async () => {
    as("editor");
    const { item: created } = await (
      await create({ kind: "note", text: "Buy paint", position: 0.5 })
    ).json();
    expect(created.position).toBe(0.5);
  });

  it.each(["viewer", "grantedViewer", "outsider", "removedFallback"] as const)(
    "refuses %s with 403 and writes nothing",
    async (actor) => {
      as(actor);
      const response = await create({ kind: "note", text: "x" });
      expect(response.status).toBe(403);
      expect(prisma.moodboardItem.create).not.toHaveBeenCalled();
    }
  );

  it("rejects mass-assigned fields such as moodboardId", async () => {
    as("editor");
    const response = await create({
      kind: "note",
      text: "x",
      moodboardId: "board-b",
      id: "chosen",
      createdById: "someone",
    });
    expect(response.status).toBe(400);
    expect(prisma.moodboardItem.create).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown kind", { kind: "pin", url: "https://x.example" }],
    ["an image without url", { kind: "image" }],
    ["a colour without colour", { kind: "color", colorName: "Rust" }],
    ["a note without text", { kind: "note" }],
    ["a bad colour", { kind: "color", color: "red" }],
    ["a data: url", { kind: "image", url: "data:image/png;base64,AAAA" }],
    ["a javascript: url", { kind: "link", url: "javascript:alert(1)" }],
    ["a protocol-relative url", { kind: "link", url: "//evil.example/x" }],
    ["a backslash path", { kind: "link", url: "/\\evil.com" }],
    ["a slash-backslash-slash path", { kind: "link", url: "/\\/evil.com" }],
    ["a path into our API", { kind: "image", url: "/api/x" }],
    ["a dotted path into our API", { kind: "image", url: "/a/../api/x" }],
    ["an API thumbnail", { kind: "note", text: "x", thumbnailUrl: "/api/x" }],
    ["a non-finite ratio", { kind: "note", text: "x", ratio: "wide" }],
    ["an extra source key", { kind: "note", text: "x", source: { a: 1 } }],
  ])("returns 400 for %s", async (_label, body) => {
    as("editor");
    const response = await create(body);
    expect(response.status).toBe(400);
    expect(prisma.moodboardItem.create).not.toHaveBeenCalled();
  });

  it("returns 400 for a body that is not JSON", async () => {
    as("editor");
    expect((await create("{not json")).status).toBe(400);
  });

  it("accepts a path on this site as an image address", async () => {
    as("editor");
    const response = await create({
      kind: "image",
      url: "/images/moodboard/chair.jpg",
    });
    expect(response.status).toBe(201);
  });

  it("answers 409 once the board holds the item limit, and writes nothing", async () => {
    for (let i = db.items.length; i < MOODBOARD_ITEM_LIMIT + 1; i += 1) {
      db.items.push(item({ id: `fill-${i}`, moodboardId: "board-a" }));
    }
    // board-b's item does not count against board-a.
    expect(db.items.filter((i) => i.moodboardId === "board-a")).toHaveLength(
      MOODBOARD_ITEM_LIMIT
    );
    as("editor");
    const response = await create({ kind: "note", text: "one more" });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Moodboard is full",
      limit: 500,
    });
    expect(prisma.moodboardItem.create).not.toHaveBeenCalled();
  });

  it("still adds the last item that fits under the limit", async () => {
    for (let i = db.items.length; i < MOODBOARD_ITEM_LIMIT; i += 1) {
      db.items.push(item({ id: `fill-${i}`, moodboardId: "board-a" }));
    }
    as("editor");
    expect((await create({ kind: "note", text: "last" })).status).toBe(201);
  });
});

describe("PATCH /api/moodboards/:id/items/:itemId", () => {
  it.each(["creator", "owner", "editor"] as const)(
    "lets %s caption and move a reference",
    async (actor) => {
      as(actor);
      const response = await patch("a-late", {
        title: "Lamp",
        position: 0,
        ratio: 0.75,
      });
      expect(response.status).toBe(200);
      const { item: updated } = await response.json();
      expect(updated).toEqual(
        expect.objectContaining({
          id: "a-late",
          title: "Lamp",
          position: 0,
          ratio: 0.75,
        })
      );
    }
  );

  it("clears a field with null", async () => {
    as("editor");
    const { item: updated } = await (
      await patch("a-tie-1", { title: null, source: null })
    ).json();
    expect(updated.title).toBeNull();
    expect(updated.source).toBeNull();
  });

  it.each([
    ["url on an image", "a-tie-1", { url: null }],
    ["url on an image with an empty string", "a-tie-1", { url: "" }],
    ["url on a link", "link-1", { url: null }],
    ["color on a colour", "color-1", { color: null }],
    ["text on a note", "a-late", { text: null }],
    ["text on a note with an empty string", "a-late", { text: "" }],
  ])("returns 400 for a patch that clears %s", async (_label, id, body) => {
    db.items.push(
      item({
        id: "link-1",
        moodboardId: "board-a",
        kind: "link",
        url: "https://example.com",
        text: null,
      }),
      item({
        id: "color-1",
        moodboardId: "board-a",
        kind: "color",
        color: "#c2410c",
        text: null,
      })
    );
    as("editor");
    expect((await patch(id, body)).status).toBe(400);
    expect(prisma.moodboardItem.update).not.toHaveBeenCalled();
  });

  it("lets a note clear a field its kind does not need", async () => {
    as("editor");
    expect((await patch("a-late", { url: null, color: null })).status).toBe(
      200
    );
  });

  it.each(["viewer", "grantedViewer", "outsider", "removedFallback"] as const)(
    "refuses %s with 403",
    async (actor) => {
      as(actor);
      expect((await patch("a-late", { title: "x" })).status).toBe(403);
      expect(prisma.moodboardItem.update).not.toHaveBeenCalled();
    }
  );

  it("refuses a removed member who still names the workspace", async () => {
    as("removedNamed");
    expect((await patch("a-late", { title: "x" })).status).toBe(403);
  });

  it("returns 404 for an item from another board", async () => {
    as("editor");
    const response = await patch("b-only", { title: "stolen" });
    expect(response.status).toBe(404);
    expect(db.items.find((i) => i.id === "b-only")?.title).toBeNull();
  });

  it.each([
    ["kind", { kind: "image" }],
    ["moodboardId", { moodboardId: "board-b" }],
    ["createdAt", { createdAt: "2020-01-01T00:00:00.000Z" }],
    ["nothing", {}],
    ["a string position", { position: "top" }],
  ])("returns 400 when the body carries %s", async (_label, body) => {
    as("editor");
    expect((await patch("a-late", body)).status).toBe(400);
    expect(prisma.moodboardItem.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/moodboards/:id/items/:itemId", () => {
  it.each(["creator", "owner", "editor"] as const)(
    "lets %s remove a reference",
    async (actor) => {
      as(actor);
      const response = await remove("a-late");
      expect(response.status).toBe(204);
      expect(db.items.some((i) => i.id === "a-late")).toBe(false);
    }
  );

  it.each(["viewer", "grantedViewer", "outsider", "removedFallback"] as const)(
    "refuses %s with 403 and keeps the item",
    async (actor) => {
      as(actor);
      expect((await remove("a-late")).status).toBe(403);
      expect(db.items.some((i) => i.id === "a-late")).toBe(true);
    }
  );

  it("refuses a removed member who still names the workspace", async () => {
    as("removedNamed");
    expect((await remove("a-late")).status).toBe(403);
  });

  it("returns 404 for an item from another board and keeps it", async () => {
    as("editor");
    expect((await remove("b-only")).status).toBe(404);
    expect(db.items.some((i) => i.id === "b-only")).toBe(true);
  });

  it("returns 404 for an item that does not exist", async () => {
    as("editor");
    expect((await remove("nope")).status).toBe(404);
  });
});

/* ---------- reorder ---------- */

const reorder = (body: unknown, board = "board-a") =>
  must(
    REORDER(request(`/api/moodboards/${board}/items`, "PATCH", body), {
      params: Promise.resolve({ id: board }),
    })
  );
const wall = (board = "board-a") =>
  db.items
    .filter((i) => i.moodboardId === board)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((i) => `${i.id}:${i.position}`);

describe("PATCH /api/moodboards/:id/items (reorder)", () => {
  it("puts the listed references in the new order and renumbers the wall 1..n", async () => {
    as("editor");
    // the wall reads a-tie-1, a-tie-2, a-late
    const res = await reorder({ order: ["a-late", "a-tie-2", "a-tie-1"] });
    expect(res.status).toBe(200);
    expect(
      ((await res.json()) as { items: { id: string }[] }).items.map((i) => i.id)
    ).toEqual(["a-late", "a-tie-2", "a-tie-1"]);
    expect(wall()).toEqual(["a-late:1", "a-tie-2:2", "a-tie-1:3"]);
  });

  it("gives the listed ones the places the listed ones held and leaves the rest where they are", async () => {
    as("editor");
    await reorder({ order: ["a-late", "a-tie-1"] });
    // a-tie-2 was in the middle and stays there
    expect(wall()).toEqual(["a-late:1", "a-tie-2:2", "a-tie-1:3"]);
  });

  it("touches the board's Date updated", async () => {
    as("editor");
    await reorder({ order: ["a-late", "a-tie-1"] });
    expect(prisma.moodboard.update).toHaveBeenCalled();
  });

  it.each(["viewer", "grantedViewer", "outsider", "removedFallback"] as const)(
    "refuses %s with 403 and moves nothing",
    async (actor) => {
      as(actor);
      const before = wall();
      expect((await reorder({ order: ["a-late", "a-tie-1"] })).status).toBe(
        403
      );
      expect(wall()).toEqual(before);
      expect(prisma.moodboardItem.update).not.toHaveBeenCalled();
    }
  );

  it("answers 404 for an id that is not on this board, and moves nothing", async () => {
    as("editor");
    const before = wall();
    expect((await reorder({ order: ["a-late", "b-only"] })).status).toBe(404);
    expect(wall()).toEqual(before);
  });

  it.each([
    ["a duplicate id", { order: ["a-late", "a-late"] }],
    ["an empty order", { order: [] }],
    ["no order", {}],
    ["a field it does not know", { order: ["a-late"], moodboardId: "x" }],
    [
      "more ids than a board can hold",
      {
        order: Array.from(
          { length: MOODBOARD_ITEM_LIMIT + 1 },
          (_, i) => `i${i}`
        ),
      },
    ],
  ])("rejects %s with 400", async (_name, body) => {
    as("editor");
    const before = wall();
    expect((await reorder(body)).status).toBe(400);
    expect(wall()).toEqual(before);
  });
});

/* ---------- pictures ---------- */

const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46,
]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

function uploadRequest(
  bytes: Buffer | null,
  fields: Record<string, string> = {},
  board = "board-a"
) {
  const form = new FormData();
  if (bytes)
    form.append(
      "file",
      new File([new Uint8Array(bytes)], "chair.jpg", { type: "image/jpeg" })
    );
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return must(
    UPLOAD(
      new NextRequest(`http://localhost/api/moodboards/${board}/items/upload`, {
        method: "POST",
        body: form,
      }),
      { params: Promise.resolve({ id: board }) }
    )
  );
}

describe("POST /api/moodboards/:id/items/upload", () => {
  it("stores the picture and adds its tile together", async () => {
    as("editor");
    const res = await uploadRequest(JPEG, {
      title: "Chair",
      ratio: "1.5",
      position: "0",
    });
    expect(res.status).toBe(201);
    const { item } = (await res.json()) as {
      item: {
        kind: string;
        url: string;
        title: string;
        ratio: number;
        position: number;
      };
    };
    expect(item).toMatchObject({
      kind: "image",
      title: "Chair",
      ratio: 1.5,
      position: 0,
    });
    expect(item.url).toBe(`/api/moodboards/board-a/assets/${db.assets[0].id}`);
    expect(db.assets).toHaveLength(1);
    expect(prisma.moodboard.update).toHaveBeenCalled();
  });

  it("reads the type from the bytes, not from what the client said", async () => {
    as("editor");
    expect((await uploadRequest(PNG)).status).toBe(201);
    expect((db.assets[0] as unknown as { mimeType: string }).mimeType).toBe(
      "image/png"
    );
  });

  it.each(["viewer", "grantedViewer", "outsider", "removedFallback"] as const)(
    "refuses %s with 403 and stores nothing",
    async (actor) => {
      as(actor);
      expect((await uploadRequest(JPEG)).status).toBe(403);
      expect(db.assets).toHaveLength(0);
    }
  );

  it("refuses a file that is not a picture (415), however it is named", async () => {
    as("editor");
    const res = await uploadRequest(Buffer.from("<svg onload=alert(1)></svg>"));
    expect(res.status).toBe(415);
    expect(db.assets).toHaveLength(0);
  });

  it("refuses a picture over 4 MB (413)", async () => {
    as("editor");
    const big = Buffer.concat([JPEG, Buffer.alloc(4 * 1024 * 1024)]);
    expect((await uploadRequest(big)).status).toBe(413);
    expect(db.assets).toHaveLength(0);
  });

  it("answers 400 for an empty file or no file", async () => {
    as("editor");
    expect((await uploadRequest(Buffer.alloc(0))).status).toBe(400);
    expect((await uploadRequest(null)).status).toBe(400);
  });

  it("answers 409 on a full board and writes nothing", async () => {
    as("editor");
    for (let i = 0; i < MOODBOARD_ITEM_LIMIT; i++)
      db.items.push(
        item({ id: `fill-${i}`, moodboardId: "board-a", position: 10 + i })
      );
    const before = db.items.length;
    expect((await uploadRequest(JPEG)).status).toBe(409);
    expect(db.items).toHaveLength(before);
    expect(db.assets).toHaveLength(0);
  });
});

describe("a picture's address in an item", () => {
  const asset = () => {
    db.assets.push({ id: "asset-x", moodboardId: "board-a" });
    return "/api/moodboards/board-a/assets/asset-x";
  };

  it("accepts this board's own uploaded picture on an image", async () => {
    as("editor");
    const url = asset();
    expect((await create({ kind: "image", url })).status).toBe(201);
  });

  it.each([
    ["a picture that does not exist", "/api/moodboards/board-a/assets/nope"],
    ["another board's picture", "/api/moodboards/board-b/assets/asset-x"],
    ["another API path", "/api/moodboards/board-a/items"],
  ])("refuses %s as an image address (400)", async (_name, url) => {
    as("editor");
    asset();
    db.assets.push({ id: "asset-x", moodboardId: "board-b" });
    expect((await create({ kind: "image", url })).status).toBe(400);
  });

  it("does not let a link or a preview picture point at an upload", async () => {
    as("editor");
    const url = asset();
    expect((await create({ kind: "link", url })).status).toBe(400);
    expect(
      (
        await create({
          kind: "link",
          url: "https://a.example.com",
          thumbnailUrl: url,
        })
      ).status
    ).toBe(400);
  });

  it("does not let a patch point an image at a picture of another board", async () => {
    as("editor");
    db.items.push(
      item({
        id: "img",
        moodboardId: "board-a",
        kind: "image",
        url: "https://i.example.com/a.jpg",
        text: null,
      })
    );
    db.assets.push({ id: "other", moodboardId: "board-b" });
    expect(
      (await patch("img", { url: "/api/moodboards/board-b/assets/other" }))
        .status
    ).toBe(400);
  });
});

describe("GET /api/moodboards/:id/assets/:assetId", () => {
  const get = (assetId: string, board = "board-a") =>
    must(
      ASSET(request(`/api/moodboards/${board}/assets/${assetId}`, "GET"), {
        params: Promise.resolve({ id: board, assetId }),
      })
    );

  beforeEach(() => {
    db.assets.push({
      id: "asset-1",
      moodboardId: "board-a",
      bytes: JPEG,
      mimeType: "image/jpeg",
    });
  });

  it.each(["creator", "editor", "viewer", "grantedViewer"] as const)(
    "serves the bytes to %s, as an image that cannot be sniffed into something else",
    async (actor) => {
      as(actor);
      const res = await get("asset-1");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("content-security-policy")).toContain(
        "default-src 'none'"
      );
    }
  );

  it.each(["outsider", "removedFallback"] as const)(
    "refuses %s (403)",
    async (actor) => {
      as(actor);
      expect((await get("asset-1")).status).toBe(403);
    }
  );

  it("answers 404 for a picture that is not on this board", async () => {
    as("editor");
    expect((await get("missing")).status).toBe(404);
  });
});

/* ---------- the old canvas, read-side ---------- */

describe("the wall carries what the old canvas stored", () => {
  it("lists the board's own references first, then the canvas tiles, read-only", async () => {
    as("viewer");
    mockCanvas.mockResolvedValue({
      items: [
        {
          id: "canvas:e1",
          kind: "note",
          url: null,
          text: "Heavier fabric",
          title: null,
          ratio: 0.7,
          position: 1_000_000_000,
          createdAt: null,
        },
      ],
      skipped: 3,
    });
    const body = (await (await list()).json()) as {
      items: { id: string; fromCanvas?: boolean }[];
      canvasSkipped: number;
    };
    expect(body.items.map((i) => i.id)).toEqual([
      "a-tie-1",
      "a-tie-2",
      "a-late",
      "canvas:e1",
    ]);
    expect(body.items.at(-1)?.fromCanvas).toBe(true);
    expect(body.items[0]).not.toHaveProperty("fromCanvas");
    expect(body.canvasSkipped).toBe(3);
  });

  it("cannot change a canvas tile: it is not a row (404)", async () => {
    as("editor");
    expect((await patch("canvas:e1", { text: "x" })).status).toBe(404);
    expect((await remove("canvas:e1")).status).toBe(404);
  });

  it("reads no canvas for a caller who may not see the board", async () => {
    as("outsider");
    expect((await list()).status).toBe(403);
    expect(mockCanvas).not.toHaveBeenCalled();
  });
});

/* ---------- link previews ---------- */

describe("a link's preview", () => {
  it("is read from the page and replaces the typed title and picture", async () => {
    as("editor");
    (unfurlLink as jest.Mock).mockResolvedValue({
      title: "Boxy wool overshirt",
      siteName: "SSENSE",
      thumbnailUrl: "https://img.example.com/a.jpg",
    });
    const res = await create({
      kind: "link",
      url: "https://www.ssense.com/en/p/overshirt",
      title: "Overshirt",
      source: { name: "Ssense", domain: "ssense.com" },
    });
    expect(res.status).toBe(201);
    const { item: made } = (await res.json()) as {
      item: {
        title: string;
        thumbnailUrl: string;
        source: { name: string; domain: string };
      };
    };
    expect(unfurlLink).toHaveBeenCalledWith(
      "https://www.ssense.com/en/p/overshirt"
    );
    expect(made).toMatchObject({
      title: "Boxy wool overshirt",
      thumbnailUrl: "https://img.example.com/a.jpg",
      source: { name: "SSENSE", domain: "ssense.com" },
    });
  });

  it("falls back to what was sent when the page cannot be read", async () => {
    as("editor");
    (unfurlLink as jest.Mock).mockResolvedValue(null);
    const { item: made } = (await (
      await create({
        kind: "link",
        url: "https://a.example.com/x",
        title: "Typed",
      })
    ).json()) as { item: { title: string; thumbnailUrl: string | null } };
    expect(made.title).toBe("Typed");
    expect(made.thumbnailUrl).toBeNull();
  });

  it("is not looked up for a picture, a colour or a note, nor when a preview picture came with it", async () => {
    as("editor");
    await create({ kind: "note", text: "x" });
    await create({ kind: "color", color: "#112233" });
    await create({
      kind: "link",
      url: "https://a.example.com/x",
      thumbnailUrl: "https://a.example.com/p.jpg",
    });
    expect(unfurlLink).not.toHaveBeenCalled();
  });

  it("is not looked up for someone who may not write", async () => {
    as("viewer");
    await create({ kind: "link", url: "https://a.example.com/x" });
    expect(unfurlLink).not.toHaveBeenCalled();
  });
});

describe("Date updated", () => {
  it.each([
    ["adding", () => create({ kind: "note", text: "x" })],
    ["changing", () => patch("a-late", { text: "y" })],
    ["removing", () => remove("a-late")],
  ])("moves when %s a reference", async (_n, act) => {
    as("editor");
    await act();
    expect(prisma.moodboard.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "board-a" } })
    );
  });

  it("does not move when a viewer's write is refused", async () => {
    as("viewer");
    await create({ kind: "note", text: "x" });
    expect(prisma.moodboard.update).not.toHaveBeenCalled();
  });
});
