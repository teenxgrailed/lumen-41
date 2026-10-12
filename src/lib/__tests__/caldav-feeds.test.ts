import { ConnectedAccount } from "@prisma/client";

import { addCalDAVFeeds, holdsEvents } from "@/lib/caldav-feeds";
import { prisma } from "@/lib/prisma";

/**
 * Connecting Apple / iCloud adds its event calendars as feeds and starts
 * their first sync (a connected account with no feeds never synced, so the
 * calendar stayed empty).
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    calendarFeed: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
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
jest.mock("@/lib/queue/enqueue", () => ({
  isQueueConfigured: () => false,
  enqueueCalendarSync: jest.fn(),
}));

const account = { id: "acct-1" } as unknown as ConnectedAccount;
const db = jest.mocked(prisma, { shallow: false });

const CALS = [
  {
    url: "https://caldav.icloud.com/1/calendars/home/",
    displayName: "Home",
    calendarColor: "#FF2968",
    components: ["VEVENT"],
  },
  {
    url: "https://caldav.icloud.com/1/calendars/work/",
    displayName: "Work",
    components: ["VEVENT", "VTODO"],
  },
  {
    url: "https://caldav.icloud.com/1/calendars/reminders/",
    displayName: "Reminders",
    components: ["VTODO"],
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  let n = 0;
  db.calendarFeed.create.mockImplementation((async ({
    data,
  }: {
    data: object;
  }) => ({ id: `feed-${++n}`, ...data })) as never);
  db.calendarFeed.update.mockResolvedValue({} as never);
});

it("adds every event calendar (not Reminders) and syncs each", async () => {
  db.calendarFeed.findMany.mockResolvedValue([] as never);
  const sync = jest.fn().mockResolvedValue(undefined);
  const r = await addCalDAVFeeds(account, "user-1", {
    discover: async () => CALS,
    sync,
  });
  expect(r.added).toEqual(["feed-1", "feed-2"]);
  expect(db.calendarFeed.create).toHaveBeenCalledTimes(2);
  expect(db.calendarFeed.create.mock.calls[0][0]).toMatchObject({
    data: {
      name: "Home",
      color: "#FF2968",
      type: "CALDAV",
      url: CALS[0].url,
      accountId: "acct-1",
      userId: "user-1",
      enabled: true,
    },
  });
  expect(sync).toHaveBeenCalledWith("feed-1", CALS[0].url);
  expect(sync).toHaveBeenCalledWith("feed-2", CALS[1].url);
});

it("skips calendars already added", async () => {
  db.calendarFeed.findMany.mockResolvedValue([{ url: CALS[0].url }] as never);
  const r = await addCalDAVFeeds(account, "user-1", {
    discover: async () => CALS,
    sync: jest.fn(),
  });
  expect(r.added).toEqual(["feed-1"]);
  expect(db.calendarFeed.create.mock.calls[0][0]).toMatchObject({
    data: { url: CALS[1].url },
  });
});

it("a failed first sync is recorded on the feed, not thrown", async () => {
  db.calendarFeed.findMany.mockResolvedValue([] as never);
  const r = await addCalDAVFeeds(account, "user-1", {
    discover: async () => [CALS[0]],
    sync: jest.fn().mockRejectedValue(new Error("503")),
  });
  expect(r.added).toEqual(["feed-1"]);
  expect(db.calendarFeed.update).toHaveBeenCalledWith({
    where: { id: "feed-1" },
    data: { error: "503" },
  });
});

it("holdsEvents: no component list means events", () => {
  expect(holdsEvents({})).toBe(true);
  expect(holdsEvents({ components: ["VTODO"] })).toBe(false);
  expect(holdsEvents({ components: ["VEVENT"] })).toBe(true);
});
