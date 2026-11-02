import { persistGoogleCalendarEvents } from "@/lib/calendar-db";
import { getGoogleCalendarClient } from "@/lib/google-calendar";
import { syncGoogleCalendar } from "@/lib/google-sync";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/google-calendar", () => ({
  getGoogleCalendarClient: jest.fn(),
}));
jest.mock("@/lib/calendar-db", () => ({
  persistGoogleCalendarEvents: jest.fn(),
  updateCalendarFeedSyncState: jest.fn(),
}));

const feed = (url: string) => ({
  id: "feed-1",
  url,
  accountId: "acct-1",
  userId: "user-1",
  syncToken: null,
});

function clientReturning(items: object[]) {
  (getGoogleCalendarClient as jest.Mock).mockResolvedValue({
    events: {
      list: jest.fn(async () => ({ data: { items, nextSyncToken: "tok" } })),
      get: jest.fn(),
    },
  });
}

function persisted() {
  const calls = (persistGoogleCalendarEvents as jest.Mock).mock.calls;
  return calls[calls.length - 1][0].events as Array<{
    title: string;
    allDay: boolean;
    start: Date;
    end: Date;
  }>;
}

describe("first Google sync keeps every event shape", () => {
  beforeEach(() => jest.clearAllMocks());

  it("stores timed events on the primary calendar", async () => {
    clientReturning([
      {
        id: "e1",
        summary: "Team sync",
        status: "confirmed",
        start: { dateTime: "2026-11-04T10:00:00+01:00" },
        end: { dateTime: "2026-11-04T10:30:00+01:00" },
      },
      {
        id: "e2",
        summary: "Gym",
        start: { dateTime: "2026-11-05T18:00:00+01:00" },
        end: { dateTime: "2026-11-05T19:00:00+01:00" },
      },
    ]);
    await syncGoogleCalendar(feed("me@example.com"), { forceFullSync: true });
    const events = persisted();
    expect(events.map((e) => e.title)).toEqual(["Team sync", "Gym"]);
    expect(events.every((e) => !e.allDay)).toBe(true);
  });

  it("stores all-day holiday and birthday events", async () => {
    clientReturning([
      {
        id: "h1",
        summary: "All Saints' Day",
        start: { date: "2026-11-01" },
        end: { date: "2026-11-02" },
        transparency: "transparent",
      },
      {
        id: "b1",
        summary: "Anna's birthday",
        eventType: "birthday",
        start: { date: "2026-11-03" },
        end: { date: "2026-11-04" },
        recurringEventId: "b1_base",
      },
    ]);
    await syncGoogleCalendar(
      feed("en.ch#holiday@group.v.calendar.google.com"),
      { forceFullSync: true }
    );
    const events = persisted();
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.allDay)).toBe(true);
    expect(events[0].start.getDate()).toBe(1);
    expect(events[0].start.getMonth()).toBe(10);
  });
});
