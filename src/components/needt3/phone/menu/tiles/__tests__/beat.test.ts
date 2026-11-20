import { pages } from "../Swap";
import { CYCLE_S, cycleIndex } from "../beat";

describe("the shared timeline", () => {
  it("a single item never moves", () => {
    for (let b = 0; b < 20; b++) expect(cycleIndex(b, 1, 0)).toBe(0);
    expect(cycleIndex(7, 0, 0)).toBe(0);
  });

  it("turns to the next item every CYCLE_S seconds", () => {
    expect(CYCLE_S).toBe(4);
    const at = (b: number) => cycleIndex(b, 3, 0);
    expect([at(0), at(3), at(4), at(7), at(8), at(12)]).toEqual([
      0, 0, 1, 1, 2, 0,
    ]);
  });

  it("staggers tiles by one second each, so they never turn on the same beat", () => {
    const turns = (offset: number) => {
      const out: number[] = [];
      for (let b = 1; b < 13; b++)
        if (cycleIndex(b, 4, offset) !== cycleIndex(b - 1, 4, offset))
          out.push(b);
      return out;
    };
    const a = turns(0);
    const b = turns(1);
    const c = turns(2);
    expect(a.some((x) => b.includes(x) || c.includes(x))).toBe(false);
    expect(b.some((x) => c.includes(x))).toBe(false);
  });

  it("never gives an index outside the list, for any offset", () => {
    for (let o = -5; o < 9; o++)
      for (let b = 0; b < 40; b++) {
        const i = cycleIndex(b, 3, o);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(3);
      }
  });
});

describe("pages", () => {
  it("cuts a list into pages, and an empty list is one empty page", () => {
    expect(pages([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(pages([], 3)).toEqual([[]]);
  });
});
