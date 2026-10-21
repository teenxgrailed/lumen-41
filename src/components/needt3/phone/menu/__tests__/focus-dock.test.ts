import { ENDING_SEC, dockLabel, dockState } from "../FocusDockButton";

describe("dockLabel", () => {
  it("shows whole minutes left, rounded up, so the last minute reads 1", () => {
    expect(dockLabel({ leftSec: 18 * 60, elapsedSec: 0 })).toBe("18");
    expect(dockLabel({ leftSec: 754, elapsedSec: 746 })).toBe("13");
    expect(dockLabel({ leftSec: 5, elapsedSec: 0 })).toBe("1");
    expect(dockLabel({ leftSec: 0, elapsedSec: 0 })).toBe("0");
  });
  it("counts up as a clock when the session has no planned length", () => {
    expect(dockLabel({ leftSec: null, elapsedSec: 65 })).toBe("01:05");
  });
  it("collapses to whole minutes past an hour so it fits the ring", () => {
    expect(dockLabel({ leftSec: 5400, elapsedSec: 0 })).toBe("90m");
  });
});

describe("dockState", () => {
  it("is running with time to spare, paused when paused", () => {
    expect(dockState({ paused: false, leftSec: 18 * 60 })).toBe("running");
    expect(dockState({ paused: true, leftSec: 18 * 60 })).toBe("paused");
    expect(dockState({ paused: false, leftSec: null })).toBe("running");
  });
  it("is ending in the last 2 minutes of a countdown, not before and not after", () => {
    expect(ENDING_SEC).toBe(120);
    expect(dockState({ paused: false, leftSec: 121 })).toBe("running");
    expect(dockState({ paused: false, leftSec: 120 })).toBe("ending");
    expect(dockState({ paused: false, leftSec: 1 })).toBe("ending");
    expect(dockState({ paused: false, leftSec: 0 })).toBe("running");
  });
  it("paused wins over ending, and a count-up never ends", () => {
    expect(dockState({ paused: true, leftSec: 60 })).toBe("paused");
    expect(dockState({ paused: false, leftSec: null })).toBe("running");
  });
});
