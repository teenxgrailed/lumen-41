import type { DayBand } from "@/lib/personal-time-days";

import { personalHitForPlacement } from "../personal-drop";

const band = (over: Partial<DayBand> = {}): DayBand => ({
  key: "k",
  blockId: "lunch",
  kind: "lunch",
  title: "Lunch",
  emoji: "🍽️",
  tone: "info",
  date: "2026-10-19",
  from: 13,
  to: 14,
  repeating: true,
  linked: false,
  ...over,
});

const bands = new Map([["2026-10-19", [band()]]]);

describe("personalHitForPlacement", () => {
  it("catches a drop that starts inside the block", () => {
    expect(
      personalHitForPlacement(bands, "2026-10-19T13:15", "2026-10-19T14:15")
    ).toMatchObject({ blockId: "lunch" });
  });

  it("catches a drop that ends inside it", () => {
    expect(
      personalHitForPlacement(bands, "2026-10-19T12:15", "2026-10-19T13:15")
    ).not.toBeNull();
  });

  it("lets a drop that only touches the edge through", () => {
    expect(
      personalHitForPlacement(bands, "2026-10-19T12:00", "2026-10-19T13:00")
    ).toBeNull();
    expect(
      personalHitForPlacement(bands, "2026-10-19T14:00", "2026-10-19T15:00")
    ).toBeNull();
  });

  it("only looks at the day it lands on", () => {
    expect(
      personalHitForPlacement(bands, "2026-10-20T13:15", "2026-10-20T14:15")
    ).toBeNull();
  });

  it("ignores a task with no time", () => {
    expect(personalHitForPlacement(bands, null, null)).toBeNull();
    expect(personalHitForPlacement(bands, undefined, undefined)).toBeNull();
  });

  it("treats a start with no end as a short stretch from the start", () => {
    expect(
      personalHitForPlacement(bands, "2026-10-19T13:30", null)
    ).not.toBeNull();
  });
});
