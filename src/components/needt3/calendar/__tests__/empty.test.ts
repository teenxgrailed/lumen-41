import { calendarEmptyState, hasConnectedFeed } from "../empty";

const days = ["2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16"];
const local = { type: "LOCAL" };
const google = { type: "GOOGLE" };

describe("hasConnectedFeed", () => {
  it("does not count Needt's own calendar", () => {
    expect(hasConnectedFeed(undefined)).toBe(false);
    expect(hasConnectedFeed([])).toBe(false);
    expect(hasConnectedFeed([local])).toBe(false);
    expect(hasConnectedFeed([local, google])).toBe(true);
    expect(hasConnectedFeed([{ type: "CALDAV" }])).toBe(true);
  });
});

describe("calendarEmptyState", () => {
  it("draws nothing until the feeds are in", () => {
    expect(calendarEmptyState({ feeds: undefined, items: [], days })).toBe(
      null
    );
  });

  it("offers to connect when no feed is connected and no event is in view", () => {
    expect(calendarEmptyState({ feeds: [], items: [], days })).toBe("connect");
    expect(calendarEmptyState({ feeds: [local], items: [], days })).toBe(
      "connect"
    );
  });

  it("keeps the card over placed tasks: they are not events", () => {
    expect(
      calendarEmptyState({
        feeds: [],
        items: [{ date: "2026-07-14" }, { date: "2026-07-15", event: false }],
        days,
      })
    ).toBe("connect");
  });

  it("goes as soon as an event lands in view", () => {
    expect(
      calendarEmptyState({
        feeds: [local],
        items: [{ date: "2026-07-14", event: true }],
        days,
      })
    ).toBe(null);
  });

  it("ignores events outside the days on screen", () => {
    expect(
      calendarEmptyState({
        feeds: [local],
        items: [{ date: "2026-07-30", event: true }],
        days,
      })
    ).toBe("connect");
  });

  it("goes quiet once a calendar is connected and the week is empty", () => {
    expect(calendarEmptyState({ feeds: [google], items: [], days })).toBe(
      "quiet"
    );
    expect(
      calendarEmptyState({
        feeds: [google],
        items: [{ date: "2026-08-01", event: true }],
        days,
      })
    ).toBe("quiet");
  });

  it("says nothing over a connected week that holds anything", () => {
    expect(
      calendarEmptyState({
        feeds: [google],
        items: [{ date: "2026-07-16" }],
        days,
      })
    ).toBe(null);
    expect(
      calendarEmptyState({
        feeds: [google],
        items: [{ date: "2026-07-13", event: true }],
        days,
      })
    ).toBe(null);
  });
});
