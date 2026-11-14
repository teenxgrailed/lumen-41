import {
  COUNT_MAX,
  canCount,
  chf,
  clampCount,
  countedParts,
  groupMoney,
  isCounter,
  needsWayIn,
  parseAmount,
  partCount,
} from "@/lib/needt3/progress";
import { stepList } from "@/lib/needt3/step-list";

const part = (id: string, title = "", done = false) => ({ id, title, done });

describe("plan 11 T-1: a counter is unnamed parts", () => {
  it("is a counter only when every part is unnamed", () => {
    expect(isCounter([])).toBe(false);
    expect(isCounter(null)).toBe(false);
    expect(isCounter([part("a"), part("b", "  ")])).toBe(true);
    expect(isCounter([part("a"), part("b", "Ship it")])).toBe(false);
  });

  it("can count a task with no parts or only unnamed ones", () => {
    expect(canCount([])).toBe(true);
    expect(canCount([part("a")])).toBe(true);
    expect(canCount([part("a", "Photograph")])).toBe(false);
  });

  it("counts done of total", () => {
    expect(partCount([part("a", "", true), part("b")])).toEqual({
      done: 1,
      total: 2,
    });
  });

  it("clamps a requested count", () => {
    expect(clampCount(3, 5)).toEqual({ target: 3, done: 3 });
    expect(clampCount(-1, 2)).toEqual({ target: 0, done: 0 });
    expect(clampCount(500, 1)).toEqual({ target: COUNT_MAX, done: 1 });
    expect(clampCount(2.7, 1.9)).toEqual({ target: 2, done: 1 });
  });

  it("keeps ids in order when the count changes", () => {
    let n = 0;
    const make = () => `new-${++n}`;
    const prev = [part("a", "", true), part("b")];
    expect(countedParts(prev, 3, 2, make)).toEqual([
      part("a", "", true),
      part("b", "", true),
      part("new-1"),
    ]);
    expect(countedParts(prev, 1, 0, make)).toEqual([part("a")]);
  });

  it("labels an unnamed part among named ones", () => {
    const items = stepList({
      done: false,
      parts: [part("a", "List it"), part("b")],
    });
    expect(items.map((s) => s.title)).toEqual(["List it", "Untitled step"]);
  });
});

describe("plan 11 T-2: asking for a way in", () => {
  it("asks after two moves, when open and with no first step", () => {
    expect(needsWayIn({ done: false, entry: null, moveCount: 2 })).toBe(true);
    expect(needsWayIn({ done: false, entry: null, moveCount: 1 })).toBe(false);
    expect(
      needsWayIn({ done: false, entry: "Open the doc", moveCount: 3 })
    ).toBe(false);
    expect(needsWayIn({ done: true, entry: null, moveCount: 5 })).toBe(false);
    expect(needsWayIn({ done: false, entry: "  ", moveCount: 2 })).toBe(true);
    expect(needsWayIn({ done: false, entry: null })).toBe(false);
  });
});

describe("plan 11 T-4: group money", () => {
  const t = (
    value: number | null,
    earned: number | null,
    done = false,
    trashedAt: string | null = null
  ) => ({ value, earned, done, trashedAt });

  it("shows no money for a group of work tasks", () => {
    expect(groupMoney([t(null, null), t(null, null, true)])).toBeNull();
  });

  it("leads with money received and lists what has not sold", () => {
    expect(
      groupMoney([
        t(120, 100, true), // sold for less than asked
        t(80, 80, true),
        t(200, null), // still listed
        t(null, null), // a work task: no money, no slot
      ])
    ).toEqual({ earned: 180, listed: 200, unpriced: 0, items: 3 });
  });

  it("never books an asking price as earned", () => {
    expect(groupMoney([t(150, null, true)])).toEqual({
      earned: 0,
      listed: 0,
      unpriced: 1,
      items: 1,
    });
  });

  it("leaves trashed tasks out", () => {
    expect(groupMoney([t(50, null, false, "2026-11-01")])).toBeNull();
  });

  it("formats francs without a break inside the number", () => {
    expect(chf(1200)).toBe("CHF 1 200");
    expect(chf(12.5)).toBe("CHF 12.50");
    expect(chf(0)).toBe("CHF 0");
  });
});

describe("plan 11 T-4: parseAmount", () => {
  it.each([
    ["", null],
    ["1200", 1200],
    ["1’200", 1200],
    ["1 200", 1200],
    ["1,200", 1200],
    ["12,50", 12.5],
    ["12.5", 12.5],
    ["1,234.50", 1234.5],
    ["1.234,50", 1234.5],
    ["CHF 80", 80],
    ["abc", undefined],
    ["-5", undefined],
    ["25000000", undefined],
  ])("%s → %s", (raw, want) => {
    expect(parseAmount(raw)).toBe(want);
  });
});
