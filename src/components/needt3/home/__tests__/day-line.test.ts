import type { V3Event } from "@/lib/needt3/map";

import { firstEvent } from "../day-line-model";

const TODAY = "2026-10-19";
const ev = (over: Partial<V3Event>): V3Event => ({
  id: "e",
  title: "Planning",
  startAt: `${TODAY}T10:00`,
  endAt: `${TODAY}T11:00`,
  isAllDay: false,
  calendarId: "c",
  source: "needt",
  externalId: null,
  ...over,
});

describe("firstEvent", () => {
  it("is the earliest event still ahead today", () => {
    const f = firstEvent(
      [
        ev({ id: "a", startAt: `${TODAY}T14:00`, title: "Late" }),
        ev({ id: "b", startAt: `${TODAY}T08:00`, title: "Gone" }),
        ev({ id: "c", startAt: `${TODAY}T10:00`, title: "Next" }),
        ev({ id: "d", startAt: "2026-10-20T07:00", title: "Tomorrow" }),
        ev({ id: "e", isAllDay: true, title: "All day" }),
      ],
      TODAY,
      9
    );
    expect(f).toMatchObject({ title: "Next", at: "10:00" });
  });
  it("never says when to leave, even for an event with a place", () => {
    const f = firstEvent([ev({ location: "Office, Main St" })], TODAY, 9);
    expect(f).toEqual({ title: expect.any(String), at: "10:00" });
  });
  it("is null when nothing is ahead", () => {
    expect(firstEvent([ev({})], TODAY, 11)).toBeNull();
  });
});
