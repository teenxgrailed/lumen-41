import { getScheduleCapacity } from "../capacity";

const findEvents = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    userSettings: { findUnique: jest.fn(async () => ({ timeZone: "UTC" })) },
    autoScheduleSettings: {
      findUnique: jest.fn(async () => ({ excludedCalendars: "[]" })),
    },
    calendarEvent: { findMany: (...args: unknown[]) => findEvents(...args) },
    task: { findMany: jest.fn(async () => []) },
  },
}));
jest.mock("@/services/scheduling/busy-feeds", () => ({
  ...jest.requireActual("@/services/scheduling/busy-feeds"),
  resolveBusyFeedIds: jest.fn(async () => ["feed-1"]),
  pushedBlockExternalIds: jest.fn(async () => new Set(["pushed-1"])),
}));
jest.mock("@/services/personal-time/service", () => ({
  personalBusyBlocks: jest.fn(async () => []),
}));
jest.mock("@/lib/work-week-server", () => ({
  loadWeekHours: jest.fn(async () =>
    [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      day,
      on: true,
      ranges: [{ start: "00:00", end: "23:59" }],
    }))
  ),
}));

const workspace = { dataScope: { mode: "personal" } } as never;

describe("getScheduleCapacity busy time", () => {
  beforeEach(() => findEvents.mockReset());

  it("asks only for blocking events", async () => {
    findEvents.mockResolvedValue([]);
    await getScheduleCapacity("user-1", workspace, 1);
    expect(findEvents.mock.calls[0][0].where).toMatchObject({
      transparent: false,
      selfDeclined: false,
    });
  });

  it("drops the echo of a pushed task block", async () => {
    const start = new Date();
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    findEvents.mockResolvedValue([{ start, end, externalEventId: "pushed-1" }]);
    const echo = await getScheduleCapacity("user-1", workspace, 2);
    findEvents.mockResolvedValue([{ start, end, externalEventId: "other" }]);
    const real = await getScheduleCapacity("user-1", workspace, 2);
    expect(echo?.calendarBusyMinutes).toBe(0);
    expect(real?.calendarBusyMinutes).toBeGreaterThan(0);
  });
});
