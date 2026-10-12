import {
  EDGE_PX,
  EDGE_SPEED,
  edgeScroll,
  nextLean,
  shiftFor,
  snapDragTime,
  sortIndexAt,
  timelineTimeAt,
} from "../geometry";

describe("drag geometry", () => {
  it("snaps a timeline drop to 15 minutes from cached geometry", () => {
    expect(snapDragTime(10.2)).toBe(10.25);
    // week grid: column top at 100px, 52px per hour from 07:00
    expect(
      timelineTimeAt(100 + 52 * 3.2, {
        rectTop: 100,
        scrollTop: 0,
        hourH: 52,
        start: 7,
        offset: 0,
      })
    ).toBe(10.25);
    // agenda gap: a huge hour height keeps its own start time
    expect(
      timelineTimeAt(130, {
        rectTop: 120,
        scrollTop: 0,
        hourH: 100000,
        start: 9.5,
        offset: 0,
      })
    ).toBe(9.5);
  });

  it("scrolls faster the deeper the hand is in the edge band", () => {
    expect(edgeScroll(300, 0, 600)).toBe(0);
    expect(edgeScroll(600, 0, 600)).toBe(EDGE_SPEED);
    expect(edgeScroll(600 - EDGE_PX / 2, 0, 600)).toBe(EDGE_SPEED / 2);
    expect(edgeScroll(0, 0, 600)).toBe(-EDGE_SPEED);
  });

  it("leans into the pointer's velocity, clamped, and not at all when calm", () => {
    expect(nextLean(0, 4, false)).toBe(1);
    expect(nextLean(0, 100, false)).toBe(3);
    expect(nextLean(0, -100, false)).toBe(-3);
    expect(nextLean(2, 10, true)).toBe(0);
  });

  it("finds the gap in a sortable list", () => {
    const rows = [0, 40, 80, 120].map((top) => ({ top, h: 36 }));
    const list = { left: 0, right: 300, top: 100, bottom: 256 };
    expect(sortIndexAt(rows, 0, 50, 100 + 18, list, 40)).toBe(0);
    expect(sortIndexAt(rows, 0, 50, 100 + 105, list, 40)).toBe(2);
    expect(sortIndexAt(rows, 3, 50, 100 + 10, list, 40)).toBe(0);
    expect(sortIndexAt(rows, 0, 900, 150, list, 40)).toBe(-1);
  });

  it("slides the rows between home and the gap by one pitch", () => {
    expect([0, 1, 2, 3].map((i) => shiftFor(i, 0, 2, 40))).toEqual([
      0, -40, -40, 0,
    ]);
    expect([0, 1, 2, 3].map((i) => shiftFor(i, 3, 1, 40))).toEqual([
      0, 40, 40, 0,
    ]);
  });
});
