import { isLaterMove, plainDemoTitle } from "../first-replan";

const demo = {
  meeting: {
    id: "m",
    title: "Demo: sync with Alex",
    start: "2026-11-18T10:45:00.000Z",
    end: "2026-11-18T11:30:00.000Z",
  },
};
const now = new Date("2026-11-18T10:00:00Z");

describe("isLaterMove", () => {
  it("accepts a start after the meeting ends and after now", () => {
    expect(isLaterMove({ start: "2026-11-18T11:30:00.000Z" }, demo, now)).toBe(
      true
    );
    expect(isLaterMove({ start: "2026-11-19T09:00:00.000Z" }, demo, now)).toBe(
      true
    );
  });

  it("rejects a start before the meeting ends, even when it is after now", () => {
    expect(isLaterMove({ start: "2026-11-18T10:15:00.000Z" }, demo, now)).toBe(
      false
    );
  });

  it("rejects a start that is already past", () => {
    const late = new Date("2026-11-18T12:00:00Z");
    expect(isLaterMove({ start: "2026-11-18T11:30:00.000Z" }, demo, late)).toBe(
      false
    );
    expect(isLaterMove({ start: "nonsense" }, demo, now)).toBe(false);
  });
});

describe("plainDemoTitle", () => {
  it("drops the demo tag and capitalises", () => {
    expect(plainDemoTitle("Demo: sync with Alex")).toBe("Sync with Alex");
    expect(plainDemoTitle("Weekly plan")).toBe("Weekly plan");
  });
});
