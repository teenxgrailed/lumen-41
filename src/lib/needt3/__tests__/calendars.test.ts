import { moveEventToDay } from "@/components/needt3/composer/parse";

import {
  calendarLabel,
  defaultFeed,
  feedSubtitle,
  isWritableFeed,
  writableFeeds,
} from "@/lib/needt3/calendars";

const local = { id: "l", type: "LOCAL", name: "Needt" };
const google = {
  id: "g",
  type: "GOOGLE",
  name: "Needt",
  url: "me@gmail.com",
  account: { email: "me@gmail.com" },
};
const holidays = {
  id: "h",
  type: "GOOGLE",
  name: "Holidays in Switzerland",
  url: "en.swiss#holiday@group.v.calendar.google.com",
};

describe("writable calendars", () => {
  it("lists Needt first, then writable synced calendars", () => {
    expect(
      writableFeeds([
        google,
        holidays,
        local,
        { ...google, id: "o", type: "OUTLOOK" },
      ]).map((f) => f.id)
    ).toEqual(["l", "g", "o"]);
  });

  it("skips disabled and read-only calendars", () => {
    expect(isWritableFeed({ ...google, enabled: false })).toBe(false);
    expect(isWritableFeed(holidays)).toBe(false);
    expect(isWritableFeed({ id: "x", type: "ICS", name: "x" })).toBe(false);
  });

  it("tells two calendars named Needt apart by account", () => {
    expect(feedSubtitle(local)).toBe("Only in Needt");
    expect(feedSubtitle(google)).toBe("me@gmail.com");
    expect(feedSubtitle({ ...google, account: null })).toBe("Google");
  });

  it("names the account once when the calendar is named after it", () => {
    const primary = { ...google, name: "me@gmail.com" };
    expect(feedSubtitle(primary)).toBe("Google");
    expect(calendarLabel("me@gmail.com", "me@gmail.com")).toBe("me@gmail.com");
    expect(calendarLabel("Work", "me@gmail.com")).toBe("Work · me@gmail.com");
    expect(calendarLabel("Needt", "Only in Needt")).toBe(
      "Needt · Only in Needt"
    );
  });

  it("a new event goes to Only in Needt unless a synced calendar was picked last", () => {
    // Google listed first in the feeds, Needt wins; nothing remembered
    expect(defaultFeed(writableFeeds([google, local]))?.id).toBe("l");
    expect(defaultFeed(writableFeeds([google, local]), null)?.id).toBe("l");
    expect(defaultFeed(writableFeeds([google, local]), "g")?.id).toBe("g");
  });

  it("defaults to the last pick, else the Needt calendar", () => {
    expect(defaultFeed([google, local], "g")?.id).toBe("g");
    expect(defaultFeed([google, local], "gone")?.id).toBe("l");
    expect(defaultFeed([google, local])?.id).toBe("l");
    expect(defaultFeed([holidays])).toBeNull();
  });
});

describe("moveEventToDay", () => {
  it("keeps the clock and the length on the picked day", () => {
    expect(
      moveEventToDay(
        { startAt: "2026-11-03T23:30", endAt: "2026-11-04T00:30" },
        "2026-11-06"
      )
    ).toEqual({ startAt: "2026-11-06T23:30", endAt: "2026-11-07T00:30" });
    expect(
      moveEventToDay(
        { startAt: "2026-11-02T11:00", endAt: "2026-11-02T11:30" },
        "2026-11-06"
      )
    ).toEqual({ startAt: "2026-11-06T11:00", endAt: "2026-11-06T11:30" });
  });
});
