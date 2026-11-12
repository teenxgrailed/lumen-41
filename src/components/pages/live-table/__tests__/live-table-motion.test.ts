import {
  ARRIVAL_STAGGER_MS,
  BUILDING_WINDOW_MS,
  HEADER_LEAD_MS,
  arrivalDelays,
  isBuilding,
} from "../live-table-motion";

describe("arrivalDelays", () => {
  it("shows an old table at once on first read", () => {
    expect(arrivalDelays(["a", "b"], null, false).size).toBe(0);
  });

  it("brings a table being built in behind its header, 55ms apart", () => {
    const delays = arrivalDelays(["a", "b", "c"], null, true);
    expect([...delays.values()]).toEqual([
      HEADER_LEAD_MS,
      HEADER_LEAD_MS + ARRIVAL_STAGGER_MS,
      HEADER_LEAD_MS + 2 * ARRIVAL_STAGGER_MS,
    ]);
  });

  it("moves only rows that arrived since the last read", () => {
    const delays = arrivalDelays(["a", "b", "c", "d"], new Set(["a", "b"]), true);
    expect([...delays.entries()]).toEqual([
      ["c", 0],
      ["d", ARRIVAL_STAGGER_MS],
    ]);
  });
});

describe("isBuilding", () => {
  const now = new Date("2026-11-12T12:00:00Z");
  it("is true right after a write and false after the window", () => {
    expect(
      isBuilding(
        { createdAt: "2026-11-12T11:00:00Z", updatedAt: "2026-11-12T11:59:30Z" },
        now
      )
    ).toBe(true);
    const old = new Date(now.getTime() - BUILDING_WINDOW_MS - 1).toISOString();
    expect(isBuilding({ createdAt: old, updatedAt: old }, now)).toBe(false);
  });
});
