import { buildStreak } from "../streak";

// 2026-11-20 is a Friday
const WINDOW = [
  "2026-11-14",
  "2026-11-15",
  "2026-11-16",
  "2026-11-17",
  "2026-11-18",
  "2026-11-19",
  "2026-11-20",
];
const TODAY = "2026-11-20";
const run = (doneDays: string[]) =>
  buildStreak({ today: TODAY, window: WINDOW, doneDays });

describe("buildStreak", () => {
  it("is zero with nothing done", () => {
    const s = run([]);
    expect(s.current).toBe(0);
    expect(s.best).toBe(0);
    expect(s.days.every((d) => !d.done)).toBe(true);
    expect(s.days).toHaveLength(7);
  });

  it("counts consecutive days ending today", () => {
    expect(run(["2026-11-18", "2026-11-19", "2026-11-20"]).current).toBe(3);
  });

  it("keeps the streak alive while today is still open", () => {
    expect(run(["2026-11-18", "2026-11-19"]).current).toBe(2);
  });

  it("breaks when yesterday was missed and today is open", () => {
    expect(run(["2026-11-17", "2026-11-18"]).current).toBe(0);
  });

  it("restarts after a gap", () => {
    expect(run(["2026-11-15", "2026-11-19", "2026-11-20"]).current).toBe(2);
  });

  it("reports the best run, which may be older than the current one", () => {
    const s = run([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-11-20",
    ]);
    expect(s.best).toBe(4);
    expect(s.current).toBe(1);
  });

  it("runs across month and year edges and ignores duplicates", () => {
    const s = buildStreak({
      today: "2027-01-02",
      window: ["2027-01-02"],
      doneDays: ["2026-12-31", "2027-01-01", "2027-01-02", "2027-01-02"],
    });
    expect(s.current).toBe(3);
    expect(s.best).toBe(3);
  });

  it("marks the seven days oldest first", () => {
    const s = run(["2026-11-15", "2026-11-20"]);
    expect(s.days.map((d) => d.done)).toEqual([
      false,
      true,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(s.today).toBe(TODAY);
  });
});
