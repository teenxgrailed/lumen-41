import { NextRequest, NextResponse } from "next/server";

import { DELETE, GET, PUT } from "@/app/api/phone-menu/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { DEFAULT_MENU_TILES } from "@/lib/phone-menu/layout";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    phoneMenuLayout: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

const db = prisma.phoneMenuLayout as unknown as Record<string, jest.Mock>;
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/phone-menu", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  jest.resetAllMocks();
  (authenticateRequest as jest.Mock).mockResolvedValue({ userId: "u1" });
  db.findUnique.mockResolvedValue(null);
  db.upsert.mockImplementation(async ({ create }) => create);
});

describe("/api/phone-menu", () => {
  it("answers 401 for a signed-out request", async () => {
    (authenticateRequest as jest.Mock).mockResolvedValue({
      response: new NextResponse("Unauthorized", { status: 401 }),
    });
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await PUT(req("PUT", { style: "card" }))).status).toBe(401);
    expect((await DELETE(req("DELETE"))).status).toBe(401);
  });

  it("GET gives the default four tiles and the tiles style before any write", async () => {
    const body = await (await GET(req("GET"))).json();
    expect(body.style).toBe("tiles");
    expect(body.tiles).toEqual(DEFAULT_MENU_TILES);
    expect(body.catalogue.tiles).toContain("streak");
    expect(db.findUnique).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("GET falls back to the default set when the stored list no longer validates", async () => {
    db.findUnique.mockResolvedValue({
      style: "card",
      tiles: [{ id: "gone", size: "1x1" }],
    });
    const body = await (await GET(req("GET"))).json();
    expect(body.style).toBe("card");
    expect(body.tiles).toEqual(DEFAULT_MENU_TILES);
  });

  it("PUT stores an ordered list for this account only", async () => {
    const tiles = [
      { id: "ask", size: "2x1" },
      { id: "today", size: "1x1" },
      { id: "project", size: "1x1", projectId: "p1" },
    ];
    const res = await PUT(req("PUT", { tiles }));
    expect(res.status).toBe(200);
    expect((await res.json()).tiles).toEqual(tiles);
    expect(db.upsert.mock.calls[0][0].where).toEqual({ userId: "u1" });
    expect(db.upsert.mock.calls[0][0].create.style).toBe("tiles");
  });

  it("PUT of the style alone keeps the stored tiles", async () => {
    db.findUnique.mockResolvedValue({
      style: "tiles",
      tiles: [{ id: "docs", size: "1x1" }],
    });
    const res = await PUT(req("PUT", { style: "card" }));
    expect(res.status).toBe(200);
    expect(db.upsert.mock.calls[0][0].update).toEqual({
      style: "card",
      tiles: [{ id: "docs", size: "1x1" }],
    });
  });

  it("PUT keeps an empty list: removing every tile is a choice", async () => {
    const res = await PUT(req("PUT", { tiles: [] }));
    expect((await res.json()).tiles).toEqual([]);
  });

  it.each([
    ["an unknown tile", { tiles: [{ id: "nope", size: "1x1" }] }],
    ["a bad size", { tiles: [{ id: "today", size: "3x3" }] }],
    [
      "a repeat",
      {
        tiles: [
          { id: "today", size: "1x1" },
          { id: "today", size: "2x1" },
        ],
      },
    ],
    [
      "a project tile with no project",
      { tiles: [{ id: "project", size: "1x1" }] },
    ],
    [
      "a projectId on another tile",
      { tiles: [{ id: "today", size: "1x1", projectId: "p" }] },
    ],
    [
      "too many tiles",
      {
        tiles: Array.from({ length: 13 }, (_, i) => ({
          id: "project",
          size: "1x1",
          projectId: `p${i}`,
        })),
      },
    ],
    ["an empty body", {}],
    ["a stray key", { style: "tiles", extra: 1 }],
    ["an unknown style", { style: "grid" }],
  ])("PUT rejects %s with a 400 and stores nothing", async (_n, body) => {
    const res = await PUT(req("PUT", body));
    expect(res.status).toBe(400);
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("DELETE removes the row and answers the default", async () => {
    db.deleteMany.mockResolvedValue({ count: 1 });
    const body = await (await DELETE(req("DELETE"))).json();
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(body.tiles).toEqual(DEFAULT_MENU_TILES);
  });
});
