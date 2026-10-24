import { NextRequest, NextResponse } from "next/server";

import { GET } from "@/app/api/whats-new/route";
import { readFile } from "node:fs/promises";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { resetWhatsNewFeedCache } from "@/lib/whats-new/feed";

jest.mock("node:fs/promises", () => ({ readFile: jest.fn() }));
jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    userSettings: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const auth = authenticateRequest as jest.Mock;
const read = readFile as unknown as jest.Mock;
const settings = prisma.userSettings.findUnique as jest.Mock;
const user = prisma.user.findUnique as jest.Mock;

const FEED = {
  version: 1,
  groups: [
    { date: "2026-10-21", entries: [{ id: "mail-1", text: "Mail" }] },
    { date: "2026-10-20", entries: [{ id: "board-1", text: "Board" }] },
  ],
};

/** The handler's response; it always answers. */
async function get(): Promise<Response> {
  const response = await GET(new NextRequest("http://localhost/api/whats-new"));
  if (!response) throw new Error("Expected a route response.");
  return response;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetWhatsNewFeedCache();
  auth.mockResolvedValue({ userId: "u1" });
  read.mockResolvedValue(JSON.stringify(FEED));
  settings.mockResolvedValue({ prefs: {} });
  user.mockResolvedValue({ createdAt: new Date("2026-10-19T10:00:00Z") });
});

describe("GET /api/whats-new", () => {
  it("needs a signed-in person", async () => {
    auth.mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await get()).status).toBe(401);
  });

  it("lists the feed with what is new since the account was created", async () => {
    const body = await (await get()).json();
    expect(body.groups).toEqual(FEED.groups);
    expect(body.unseen).toEqual(["mail-1", "board-1"]);
    expect(body.marker).toEqual({ date: "2026-10-21", ids: ["mail-1"] });
  });

  it("counts only what came after the stored marker", async () => {
    settings.mockResolvedValue({
      prefs: { whatsNewSeen: { date: "2026-10-20", ids: ["board-1"] } },
    });
    expect((await (await get()).json()).unseen).toEqual(["mail-1"]);
  });

  it("serves an empty feed when the compiled file is missing", async () => {
    read.mockRejectedValue(new Error("ENOENT"));
    const body = await (await get()).json();
    expect(body).toEqual({ groups: [], unseen: [], marker: null });
  });
});
