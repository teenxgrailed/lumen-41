import { movedToLaterDay, placedLater } from "../moves";

const ZONE = "Europe/Berlin";
// 23 October 2026, Berlin: 00:00 is 22.10 22:00Z (CEST, UTC+2).
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("placedLater", () => {
  it("a later calendar day counts", () => {
    expect(
      placedLater("2026-10-23T09:00:00Z", "2026-10-24T09:00:00Z", ZONE)
    ).toBe(true);
  });

  it("a new time on the same day does not", () => {
    expect(
      placedLater("2026-10-23T09:00:00Z", "2026-10-23T15:00:00Z", ZONE)
    ).toBe(false);
  });

  it("the person's zone decides the day, not UTC", () => {
    // 22:30Z on the 23rd is already the 24th in Berlin.
    expect(
      placedLater("2026-10-23T08:00:00Z", "2026-10-23T22:30:00Z", ZONE)
    ).toBe(true);
    expect(
      placedLater("2026-10-23T08:00:00Z", "2026-10-23T22:30:00Z", "UTC")
    ).toBe(false);
  });

  it("an earlier day does not", () => {
    expect(
      placedLater("2026-10-24T09:00:00Z", "2026-10-23T09:00:00Z", ZONE)
    ).toBe(false);
  });

  it("a task that had no placement before does not", () => {
    expect(placedLater(null, "2026-10-24T09:00:00Z", ZONE)).toBe(false);
    expect(placedLater(undefined, "2026-10-24T09:00:00Z", ZONE)).toBe(false);
    expect(placedLater("2026-10-24T09:00:00Z", null, ZONE)).toBe(false);
  });
});

describe("movedToLaterDay", () => {
  const before = {
    dueDate: new Date("2026-10-22T22:00:00.000Z"), // 23.10 Berlin
    scheduledStart: new Date("2026-10-23T09:00:00.000Z"),
  };

  it("a later due day counts, by the user or the scheduler alike", () => {
    expect(
      movedToLaterDay(
        before,
        { dueDate: new Date("2026-10-23T22:00:00.000Z") },
        ZONE
      )
    ).toBe(true);
  });

  it("a later placed start counts", () => {
    expect(
      movedToLaterDay(
        before,
        { scheduledStart: new Date("2026-10-26T09:00:00.000Z") },
        ZONE
      )
    ).toBe(true);
  });

  it("an earlier day, the same day and an unchanged field do not", () => {
    expect(
      movedToLaterDay(
        before,
        { dueDate: new Date("2026-10-21T22:00:00.000Z") },
        ZONE
      )
    ).toBe(false);
    expect(
      movedToLaterDay(
        before,
        { scheduledStart: new Date("2026-10-23T16:00:00.000Z") },
        ZONE
      )
    ).toBe(false);
    expect(movedToLaterDay(before, {}, ZONE)).toBe(false);
  });

  it("a task with no day before is not postponed by getting one", () => {
    expect(
      movedToLaterDay(
        { dueDate: null, scheduledStart: null },
        { dueDate: day("2026-10-30"), scheduledStart: day("2026-10-30") },
        ZONE
      )
    ).toBe(false);
  });

  it("clearing a date does not count", () => {
    expect(movedToLaterDay(before, { dueDate: null }, ZONE)).toBe(false);
    expect(movedToLaterDay(before, { scheduledStart: null }, ZONE)).toBe(false);
  });
});
