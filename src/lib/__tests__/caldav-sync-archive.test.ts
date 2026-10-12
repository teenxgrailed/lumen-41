import { ConnectedAccount } from "@prisma/client";

import {
  CALDAV_REMOVED_UPSTREAM,
  CalDAVCalendarService,
  isTombstone,
} from "@/lib/caldav-calendar";
import { prisma } from "@/lib/prisma";

/**
 * A CalDAV sync with a fake server (no network, prisma mocked):
 * - a failed fetch must fail the sync, not read as "no events" — that used to
 *   archive every event of the feed;
 * - an event the sync archived because the server stopped returning it comes
 *   back when the server returns it again;
 * - an event the person deleted (archived locally) stays deleted.
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    calendarFeed: { findFirst: jest.fn(), update: jest.fn() },
    calendarEvent: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
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

const account = {
  id: "acct-1",
  email: "me@icloud.com",
  caldavUsername: "me@icloud.com",
  accessToken: "token",
  caldavUrl: "https://caldav.icloud.com",
} as unknown as ConnectedAccount;

const FEED = { id: "feed-1", syncToken: null };
const PATH = "https://caldav.icloud.com/123/calendars/home/";

const ics = (uid: string, title: string) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SUMMARY:${title}`,
    "DTSTART:20261012T090000Z",
    "DTEND:20261012T100000Z",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

function serviceWith(calendarQuery: jest.Mock) {
  const service = new CalDAVCalendarService(account);
  (service as unknown as { getClient: () => Promise<unknown> }).getClient =
    async () => ({ calendarQuery });
  return service;
}

const db = jest.mocked(prisma, { shallow: false });

beforeEach(() => {
  jest.clearAllMocks();
  db.calendarFeed.findFirst.mockResolvedValue(FEED as never);
  db.calendarFeed.update.mockResolvedValue(FEED as never);
  db.calendarEvent.updateMany.mockResolvedValue({ count: 0 } as never);
  db.calendarEvent.create.mockImplementation((async ({
    data,
  }: {
    data: object;
  }) => ({ id: "new", ...data })) as never);
  db.calendarEvent.update.mockImplementation((async ({
    data,
  }: {
    data: object;
  }) => ({ id: "old", ...data })) as never);
});

it("a failed fetch fails the sync and archives nothing", async () => {
  const query = jest.fn().mockRejectedValue(new Error("401 Unauthorized"));
  await expect(
    serviceWith(query).syncCalendar(FEED.id, PATH, "user-1")
  ).rejects.toThrow("401");
  expect(db.calendarEvent.updateMany).not.toHaveBeenCalled();
  expect(db.calendarFeed.update).not.toHaveBeenCalled();
});

it("events missing upstream are archived as REMOVED_UPSTREAM", async () => {
  const query = jest
    .fn()
    .mockResolvedValue([
      { href: "/a.ics", props: { calendarData: ics("a", "Standup") } },
    ]);
  db.calendarEvent.findFirst.mockResolvedValue(null as never);
  await serviceWith(query).syncCalendar(FEED.id, PATH, "user-1");
  expect(db.calendarEvent.updateMany).toHaveBeenCalledWith({
    where: {
      feedId: FEED.id,
      archivedAt: null,
      externalEventId: { notIn: ["a"] },
    },
    data: {
      archivedAt: expect.any(Date),
      syncStatus: CALDAV_REMOVED_UPSTREAM,
    },
  });
  expect(db.calendarEvent.create).toHaveBeenCalledTimes(1);
});

it("an event the sync archived comes back when the server returns it", async () => {
  const query = jest
    .fn()
    .mockResolvedValue([
      { href: "/a.ics", props: { calendarData: ics("a", "Standup") } },
    ]);
  db.calendarEvent.findFirst.mockResolvedValue({
    id: "old",
    archivedAt: new Date("2026-10-01T00:00:00Z"),
    syncStatus: CALDAV_REMOVED_UPSTREAM,
  } as never);
  await serviceWith(query).syncCalendar(FEED.id, PATH, "user-1");
  expect(db.calendarEvent.update).toHaveBeenCalledWith({
    where: { id: "old" },
    data: expect.objectContaining({
      title: "Standup",
      archivedAt: null,
      syncStatus: null,
    }),
  });
});

it("an event the person deleted stays deleted", async () => {
  const query = jest
    .fn()
    .mockResolvedValue([
      { href: "/a.ics", props: { calendarData: ics("a", "Standup") } },
    ]);
  db.calendarEvent.findFirst.mockResolvedValue({
    id: "old",
    archivedAt: new Date("2026-10-01T00:00:00Z"),
    syncStatus: null,
  } as never);
  await serviceWith(query).syncCalendar(FEED.id, PATH, "user-1");
  expect(db.calendarEvent.update).not.toHaveBeenCalled();
  expect(db.calendarEvent.create).not.toHaveBeenCalled();
});

it("isTombstone", () => {
  expect(isTombstone(null)).toBe(false);
  expect(isTombstone({ archivedAt: null })).toBe(false);
  expect(isTombstone({ archivedAt: new Date(), syncStatus: null })).toBe(true);
  expect(
    isTombstone({ archivedAt: new Date(), syncStatus: CALDAV_REMOVED_UPSTREAM })
  ).toBe(false);
});
