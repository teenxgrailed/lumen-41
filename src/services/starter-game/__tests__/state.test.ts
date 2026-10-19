import { addCalendarDays } from "@/lib/date-utils";
import { getPlan } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

import { hideStarterGame, readStarterStatus } from "../state";

jest.mock("@/lib/entitlements", () => ({ getPlan: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    starterGameState: { findUnique: jest.fn(), upsert: jest.fn() },
    task: { count: jest.fn() },
  },
}));

const db = prisma as unknown as {
  starterGameState: { findUnique: jest.Mock; upsert: jest.Mock };
  task: { count: jest.Mock };
};
const NOW = new Date("2026-10-19T09:00:00.000Z");

beforeEach(() => {
  jest.clearAllMocks();
  (getPlan as jest.Mock).mockResolvedValue("PRO");
  db.starterGameState.findUnique.mockResolvedValue(null);
  db.task.count.mockResolvedValue(2);
});

describe("readStarterStatus", () => {
  it("shows the card under five open tasks", async () => {
    const s = await readStarterStatus({
      userId: "u1",
      workspace: undefined,
      now: NOW,
    });
    expect(s).toMatchObject({ eligible: true, hidden: false, openTasks: 2 });
    expect(db.task.count.mock.calls[0][0].where).toMatchObject({
      userId: "u1",
      isArchived: false,
      status: { in: ["todo", "in_progress"] },
    });
  });

  it("does not show it from five open tasks", async () => {
    db.task.count.mockResolvedValue(5);
    expect(
      (
        await readStarterStatus({
          userId: "u1",
          workspace: undefined,
          now: NOW,
        })
      ).eligible
    ).toBe(false);
    db.task.count.mockResolvedValue(4);
    expect(
      (
        await readStarterStatus({
          userId: "u1",
          workspace: undefined,
          now: NOW,
        })
      ).eligible
    ).toBe(true);
  });

  it("hides it until the date, then shows it again", async () => {
    db.starterGameState.findUnique.mockResolvedValue({
      neverShow: false,
      hiddenUntil: new Date("2026-10-26T09:00:00.000Z"),
    });
    expect(
      (
        await readStarterStatus({
          userId: "u1",
          workspace: undefined,
          now: NOW,
        })
      ).hidden
    ).toBe(true);
    const later = await readStarterStatus({
      userId: "u1",
      workspace: undefined,
      now: new Date("2026-10-26T09:00:01.000Z"),
    });
    expect(later).toMatchObject({ hidden: false, eligible: true });
  });

  it("hides it for good", async () => {
    db.starterGameState.findUnique.mockResolvedValue({
      neverShow: true,
      hiddenUntil: null,
    });
    expect(
      (
        await readStarterStatus({
          userId: "u1",
          workspace: undefined,
          now: NOW,
        })
      ).eligible
    ).toBe(false);
  });

  it("tells a Free account it cannot play, but still shows the card", async () => {
    (getPlan as jest.Mock).mockResolvedValue("FREE");
    expect(
      await readStarterStatus({ userId: "u1", workspace: undefined, now: NOW })
    ).toMatchObject({ canPlay: false, eligible: true });
  });
});

describe("hideStarterGame", () => {
  it("'Not now' hides for 7 days", async () => {
    await hideStarterGame("u1", "7d", NOW);
    expect(db.starterGameState.upsert).toHaveBeenCalledWith({
      where: { userId: "u1" },
      create: {
        userId: "u1",
        neverShow: false,
        hiddenUntil: addCalendarDays(NOW, 7),
      },
      update: {
        neverShow: false,
        hiddenUntil: addCalendarDays(NOW, 7),
      },
    });
  });

  it("'Don't show again' hides for good", async () => {
    await hideStarterGame("u1", "never", NOW);
    expect(db.starterGameState.upsert.mock.calls[0][0].update).toEqual({
      neverShow: true,
      hiddenUntil: null,
    });
  });

  it("'show' clears both", async () => {
    await hideStarterGame("u1", "show", NOW);
    expect(db.starterGameState.upsert.mock.calls[0][0].update).toEqual({
      neverShow: false,
      hiddenUntil: null,
    });
  });
});
