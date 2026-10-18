/**
 * @jest-environment jsdom
 */
import { inNudgeWindow, nudgeOff, setNudgeOff, workEndToday } from "../nudge";

describe("workEndToday", () => {
  it("reads the per-day windows first: the last range's end", () => {
    const work = {
      days: [1, 2, 3, 4, 5],
      start: 9,
      end: 18,
      byDay: {
        2: [
          [9, 12],
          [13, 17.5],
        ] as [number, number][],
      },
    };
    expect(workEndToday(work, 2)).toBe(17.5);
    // a weekday with no entry is a day off
    expect(workEndToday(work, 3)).toBeNull();
  });
  it("falls back to the single range and its days", () => {
    const work = { days: [1, 2, 3, 4, 5], start: 9, end: 18 };
    expect(workEndToday(work, 1)).toBe(18);
    expect(workEndToday(work, 6)).toBeNull();
  });
  it("is null with no hours", () => {
    expect(workEndToday(null, 1)).toBeNull();
  });
});

describe("inNudgeWindow", () => {
  it("is the last 30 minutes, end excluded", () => {
    expect(inNudgeWindow(16.9, 17.5)).toBe(false);
    expect(inNudgeWindow(17, 17.5)).toBe(true);
    expect(inNudgeWindow(17.49, 17.5)).toBe(true);
    expect(inNudgeWindow(17.5, 17.5)).toBe(false);
  });
  it("is never on a day off", () => {
    expect(inNudgeWindow(17, null)).toBe(false);
  });
});

describe("the memory", () => {
  beforeEach(() => window.localStorage.clear());
  it("remembers a dismissal for that day only", () => {
    expect(nudgeOff("2026-10-19")).toBe(false);
    setNudgeOff("2026-10-19");
    expect(nudgeOff("2026-10-19")).toBe(true);
    expect(nudgeOff("2026-10-20")).toBe(false);
  });
  it("survives storage that throws", () => {
    const spy = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(nudgeOff("2026-10-19")).toBe(false);
    spy.mockRestore();
  });
});
