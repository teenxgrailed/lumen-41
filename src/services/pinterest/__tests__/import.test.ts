import { SafeFetchError } from "@/services/imports/safe-fetch";

import { prisma } from "@/lib/prisma";

import { PinterestApiError, listPinterestPins } from "../client";
import { PinterestPlanError } from "../connection";
import {
  importPinterestBoard,
  isPinimgHost,
  syncPinterestBoards,
} from "../import";

jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    moodboard: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));
jest.mock("@/lib/auth/workspace-auth", () => ({
  WorkspaceAuthorizationError: class extends Error {},
  resolveWorkspaceAccess: jest.fn(async () => ({
    workspaceId: "w1",
    role: "EDITOR",
  })),
}));
jest.mock("../client", () => ({
  ...jest.requireActual("../client"),
  listPinterestPins: jest.fn(),
}));
const mockPlan = jest.fn();
const mockWith = jest.fn();
jest.mock("../connection", () => ({
  ...jest.requireActual("../connection"),
  assertPinterestPlan: (...a: unknown[]) => mockPlan(...a),
  hasPinterestPlan: jest.fn(async () => true),
  withPinterest: (...a: unknown[]) => mockWith(...a),
}));
const mockImage = jest.fn();
jest.mock("@/services/moodboards/moodboard-item-service", () => ({
  ...jest.requireActual("@/services/moodboards/moodboard-item-service"),
  assertCanWriteMoodboard: jest.fn(async () => undefined),
  createMoodboardImage: (...a: unknown[]) => mockImage(...a),
}));

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0]);
const actor = { userId: "u1", workspace: { workspaceId: "w1" } } as never;
const pin = (id: string, n = 1) => ({
  id,
  title: `Pin ${id}`,
  description: null,
  pinUrl: `https://www.pinterest.com/pin/${id}/`,
  images: Array.from({ length: n }, (_, i) => ({
    url: `https://i.pinimg.com/s${i}/${id}.jpg`,
    width: 600,
    height: 900,
  })),
});
const download = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockPlan.mockResolvedValue(undefined);
  mockWith.mockImplementation(
    async (_u: string, fn: (t: string) => Promise<unknown>) => fn("tok")
  );
  mockImage.mockResolvedValue({ id: "item" });
  download.mockResolvedValue({
    bytes: PNG,
    contentType: "image/png",
    finalUrl: "",
  });
  (prisma.moodboard.update as jest.Mock).mockResolvedValue({ id: "m1" });
});

it("only pinimg.com is an allowed picture host", () => {
  expect(isPinimgHost("i.pinimg.com")).toBe(true);
  expect(isPinimgHost("pinimg.com")).toBe(true);
  expect(isPinimgHost("evilpinimg.com")).toBe(false);
  expect(isPinimgHost("pinimg.com.evil.test")).toBe(false);
});

describe("importPinterestBoard", () => {
  beforeEach(() => {
    (prisma.moodboard.findUnique as jest.Mock).mockResolvedValue({
      pinterestBoardId: null,
      pinterestSeen: [],
    });
  });

  it("is a Pro feature", async () => {
    mockPlan.mockRejectedValueOnce(new PinterestPlanError());
    await expect(
      importPinterestBoard(actor, "m1", {
        pinterestBoardId: "5",
        keepInSync: false,
      })
    ).rejects.toBeInstanceOf(PinterestPlanError);
    expect(mockImage).not.toHaveBeenCalled();
  });

  it("copies each Pin as a picture that keeps its Pin link, and links the board", async () => {
    (listPinterestPins as jest.Mock).mockResolvedValueOnce({
      pins: [pin("1"), pin("2")],
      bookmark: null,
    });
    const r = await importPinterestBoard(
      actor,
      "m1",
      { pinterestBoardId: "5", keepInSync: true },
      download
    );
    expect(r).toEqual({ imported: 2, skipped: 0, failed: 0, full: false });
    expect(download).toHaveBeenCalledWith(
      "https://i.pinimg.com/s0/1.jpg",
      expect.objectContaining({
        allowHost: isPinimgHost,
        maxBytes: 1.5 * 1024 * 1024,
      })
    );
    expect(mockImage.mock.calls[0][2]).toMatchObject({
      title: "Pin 1",
      origin: {
        name: "Pinterest",
        domain: "pinterest.com",
        url: "https://www.pinterest.com/pin/1/",
      },
    });
    expect(prisma.moodboard.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pinterestBoardId: "5",
          pinterestSync: true,
          pinterestConnectedById: "u1",
          pinterestSeen: ["1", "2"],
        }),
      })
    );
  });

  it("skips Pins it has seen on the same board, even ones the person removed", async () => {
    (prisma.moodboard.findUnique as jest.Mock).mockResolvedValue({
      pinterestBoardId: "5",
      pinterestSeen: ["1"],
    });
    (listPinterestPins as jest.Mock).mockResolvedValueOnce({
      pins: [pin("1"), pin("2")],
      bookmark: null,
    });
    const r = await importPinterestBoard(
      actor,
      "m1",
      { pinterestBoardId: "5", keepInSync: false },
      download
    );
    expect(r.imported).toBe(1);
    expect(r.skipped).toBe(1);
    expect(mockImage).toHaveBeenCalledTimes(1);
  });

  it("tries the next size when one is too large, and counts a Pin with none as failed", async () => {
    (listPinterestPins as jest.Mock).mockResolvedValueOnce({
      pins: [pin("1", 2), pin("2", 1)],
      bookmark: null,
    });
    download.mockImplementation(async (url: string) => {
      if (url.includes("/s0/")) throw new SafeFetchError("too_large", "big");
      if (url.includes("/2.jpg")) throw new SafeFetchError("blocked_url", "no");
      return { bytes: PNG, contentType: "image/png", finalUrl: url };
    });
    const r = await importPinterestBoard(
      actor,
      "m1",
      { pinterestBoardId: "5", keepInSync: false },
      download
    );
    expect(r).toMatchObject({ imported: 1, failed: 1 });
  });

  it("refuses bytes that are not a picture", async () => {
    (listPinterestPins as jest.Mock).mockResolvedValueOnce({
      pins: [pin("1")],
      bookmark: null,
    });
    download.mockResolvedValue({
      bytes: Buffer.from("<html>"),
      contentType: "text/html",
      finalUrl: "",
    });
    const r = await importPinterestBoard(
      actor,
      "m1",
      { pinterestBoardId: "5", keepInSync: false },
      download
    );
    expect(r).toMatchObject({ imported: 0, failed: 1 });
    expect(mockImage).not.toHaveBeenCalled();
  });
});

describe("syncPinterestBoards", () => {
  const due = (id: string, user = "u1", seen: string[] = []) => ({
    id,
    workspaceId: "w1",
    pinterestBoardId: "5",
    pinterestConnectedById: user,
    pinterestSeen: seen,
  });

  it("appends only Pins it has not seen and never deletes", async () => {
    (prisma.moodboard.findMany as jest.Mock).mockResolvedValue([
      due("m1", "u1", ["1"]),
    ]);
    (listPinterestPins as jest.Mock).mockResolvedValueOnce({
      pins: [pin("1"), pin("2")],
      bookmark: null,
    });
    const r = await syncPinterestBoards({ download });
    expect(r).toEqual({ checked: 1, added: 1, stopped: null });
    expect(mockImage).toHaveBeenCalledTimes(1);
    const data = (prisma.moodboard.update as jest.Mock).mock.calls[0][0].data;
    expect(data.pinterestSeen).toEqual(["1", "2"]);
    expect(Object.keys(data)).not.toContain("pinterestSync");
  });

  it("only asks for boards that are synced and not looked at in 23 hours", async () => {
    (prisma.moodboard.findMany as jest.Mock).mockResolvedValue([]);
    await syncPinterestBoards();
    const where = (prisma.moodboard.findMany as jest.Mock).mock.calls[0][0]
      .where;
    expect(where).toMatchObject({
      pinterestSync: true,
      trashedAt: null,
      archivedAt: null,
    });
    expect(where.OR[1].pinterestSyncedAt.lt).toBeInstanceOf(Date);
  });

  it("skips a person's other boards once Pinterest turns their token down", async () => {
    (prisma.moodboard.findMany as jest.Mock).mockResolvedValue([
      due("m1"),
      due("m2"),
      due("m3", "u2"),
    ]);
    mockWith.mockImplementation(
      async (u: string, fn: (t: string) => Promise<unknown>) => {
        if (u === "u1") throw new PinterestApiError("unauthorized", "ended");
        return fn("tok");
      }
    );
    (listPinterestPins as jest.Mock).mockResolvedValue({
      pins: [],
      bookmark: null,
    });
    const r = await syncPinterestBoards({ download });
    expect(r.checked).toBe(2); // m1 (failed) and m3; m2 is skipped
  });

  it("ends the pass on a rate limit", async () => {
    (prisma.moodboard.findMany as jest.Mock).mockResolvedValue([
      due("m1"),
      due("m2", "u2"),
    ]);
    mockWith.mockRejectedValueOnce(
      new PinterestApiError("rate_limited", "slow")
    );
    const r = await syncPinterestBoards({ download });
    expect(r.stopped).toBe("rate_limited");
    expect(mockWith).toHaveBeenCalledTimes(1);
  });

  it("stops at its request budget", async () => {
    (prisma.moodboard.findMany as jest.Mock).mockResolvedValue([
      due("m1"),
      due("m2", "u2"),
      due("m3", "u3"),
    ]);
    (listPinterestPins as jest.Mock).mockResolvedValue({
      pins: [],
      bookmark: null,
    });
    const r = await syncPinterestBoards({ budget: 2, download });
    expect(r).toMatchObject({ checked: 2, stopped: "budget" });
  });

  it("switches sync off when the source board is gone", async () => {
    (prisma.moodboard.findMany as jest.Mock).mockResolvedValue([due("m1")]);
    mockWith.mockRejectedValueOnce(new PinterestApiError("not_found", "gone"));
    await syncPinterestBoards({ download });
    expect(prisma.moodboard.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { pinterestSync: false, pinterestStatus: "lost" },
      })
    );
  });
});
