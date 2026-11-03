import { eventGesturePatch } from "../event-drop";

const ev = {
  startAt: "2026-09-09T10:00",
  endAt: "2026-09-09T11:00",
  isAllDay: false,
};

describe("eventGesturePatch", () => {
  it("moves an event by the snapped distance and keeps its length", () => {
    expect(eventGesturePatch(ev, "move", 1.5)).toEqual({
      startAt: "2026-09-09T11:30",
      endAt: "2026-09-09T12:30",
    });
    // 10 minutes snaps to the nearest quarter hour
    expect(eventGesturePatch(ev, "move", 10 / 60)).toEqual({
      startAt: "2026-09-09T10:15",
      endAt: "2026-09-09T11:15",
    });
  });

  it("moves to another day when the drop crossed columns", () => {
    expect(eventGesturePatch(ev, "move", 0, 2)).toEqual({
      startAt: "2026-09-11T10:00",
      endAt: "2026-09-11T11:00",
    });
    expect(eventGesturePatch(ev, "move", -2, -1)).toEqual({
      startAt: "2026-09-08T08:00",
      endAt: "2026-09-08T09:00",
    });
  });

  it("keeps the start inside its day and lets the end run past midnight", () => {
    expect(eventGesturePatch(ev, "move", 20)).toEqual({
      startAt: "2026-09-09T23:45",
      endAt: "2026-09-10T00:45",
    });
    expect(eventGesturePatch(ev, "move", -20)).toEqual({
      startAt: "2026-09-09T00:00",
      endAt: "2026-09-09T01:00",
    });
  });

  it("resizes only the end, never below a quarter hour", () => {
    expect(eventGesturePatch(ev, "resize", 0.5)).toEqual({
      startAt: "2026-09-09T10:00",
      endAt: "2026-09-09T11:30",
    });
    expect(eventGesturePatch(ev, "resize", -5)).toEqual({
      startAt: "2026-09-09T10:00",
      endAt: "2026-09-09T10:15",
    });
  });

  it("writes nothing when nothing changed, and nothing for an all-day event", () => {
    expect(eventGesturePatch(ev, "move", 0)).toBeNull();
    expect(eventGesturePatch(ev, "move", 0.05)).toBeNull();
    expect(eventGesturePatch(ev, "resize", 0)).toBeNull();
    expect(
      eventGesturePatch({ ...ev, isAllDay: true }, "move", 1, 1)
    ).toBeNull();
  });
});
