import { highlightRuns, match, rank } from "../match";

describe("⌘K matching", () => {
  it("prefers a whole match at the start, then at a word start", () => {
    const start = match("Calendar sync", "cal")!;
    const word = match("Team calendar", "cal")!;
    const inner = match("Recall notes", "cal")!;
    expect(start.idx).toEqual([0, 1, 2]);
    expect(start.score).toBeGreaterThan(word.score);
    expect(word.score).toBeGreaterThan(inner.score);
  });

  it("matches every word in any order", () => {
    const m = match("Launch checklist for print", "print launch")!;
    expect(m.score).toBe(50);
    expect(m.idx).toContain(0);
  });

  it("letters in order must start words or run together", () => {
    expect(match("Quarterly tax filing", "qtf")).not.toBeNull();
    expect(match("clock tower", "cal")).toBeNull();
    expect(match("anything", "ab")).toBeNull();
    expect(match("anything", "  ")).toBeNull();
  });

  it("ranks best first and caps the list", () => {
    const items = ["Recall notes", "Calendar", "Team calendar", "x", "cal 2"];
    const out = rank(items, (s) => s, "cal", 2).map((r) => r.item);
    expect(out).toEqual(["Calendar", "cal 2"]);
  });

  it("splits text into bold and plain runs", () => {
    expect(highlightRuns("Calendar", [0, 1, 2])).toEqual([
      { text: "Cal", on: true },
      { text: "endar", on: false },
    ]);
    expect(highlightRuns("abc", undefined)).toEqual([
      { text: "abc", on: false },
    ]);
  });
});
