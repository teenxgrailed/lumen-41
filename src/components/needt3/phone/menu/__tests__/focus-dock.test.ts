import { dockLabel } from "../FocusDockButton";

describe("dockLabel", () => {
  it("shows the clock while there is under an hour", () => {
    expect(dockLabel({ leftSec: 754, elapsedSec: 746 })).toBe("12:34");
  });
  it("counts up when the session has no planned length", () => {
    expect(dockLabel({ leftSec: null, elapsedSec: 65 })).toBe("01:05");
  });
  it("collapses to whole minutes past an hour so it fits the ring", () => {
    expect(dockLabel({ leftSec: 5400, elapsedSec: 0 })).toBe("90m");
  });
});
