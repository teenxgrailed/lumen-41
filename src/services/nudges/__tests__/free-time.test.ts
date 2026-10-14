import { describeGap, longestFreeGap } from "../free-time";

const H = 3_600_000;
const at = (h: number) => h * H;

describe("longestFreeGap", () => {
  const day = { start: at(9), end: at(18) };

  it("returns the longest unbooked stretch", () => {
    const gap = longestFreeGap(day, [
      { start: at(9), end: at(11) },
      { start: at(15), end: at(16) },
    ]);
    expect(gap).toEqual({ start: at(11), end: at(15) });
  });

  it("merges overlapping and unordered busy spans", () => {
    const gap = longestFreeGap(day, [
      { start: at(13), end: at(16) },
      { start: at(9), end: at(12) },
      { start: at(11), end: at(14) },
    ]);
    expect(gap).toEqual({ start: at(16), end: at(18) });
  });

  it("ignores busy time outside the window", () => {
    const gap = longestFreeGap(day, [
      { start: at(0), end: at(8) },
      { start: at(19), end: at(22) },
    ]);
    expect(gap).toEqual(day);
  });

  it("is null when no stretch reaches the minimum", () => {
    expect(
      longestFreeGap(day, [
        { start: at(9), end: at(11) },
        { start: at(12), end: at(14) },
        { start: at(15), end: at(18) },
      ])
    ).toBeNull();
  });

  it("is null for an empty or inverted window", () => {
    expect(longestFreeGap({ start: at(10), end: at(10) }, [])).toBeNull();
    expect(longestFreeGap({ start: at(11), end: at(10) }, [])).toBeNull();
  });
});

describe("describeGap", () => {
  it("names the range and rounds to the half hour", () => {
    const out = describeGap({ start: at(14), end: at(16) }, (ms) => {
      const h = Math.round(ms / H);
      return `${h}:00`;
    });
    expect(out).toEqual({ range: "14:00–16:00", hours: 2 });
  });
});
