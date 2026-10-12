import {
  C2_GUT,
  type CalBlock,
  type TimedBlock,
  c2AgendaFold,
  c2GapTime,
  c2Lay,
  c2Place,
  c2PosStyle,
  c2VEnd,
  c2WithGaps,
  daySpan,
  freeSlot,
  hourBounds,
  isoWeek,
  slotAt,
  spanLabel,
  weekStart,
} from "../layout";

const D = "2026-09-01";
const tb = (id: string, at: number, len: number, extra = {}): TimedBlock => ({
  id,
  date: D,
  at,
  len,
  title: id,
  ...extra,
});

describe("c2Lay", () => {
  it("puts non-overlapping blocks in their own one-column clusters", () => {
    const out = c2Lay([tb("a", 9, 60), tb("b", 11, 30)]);
    expect(out.map((x) => [x.b.id, x.col, x.cols])).toEqual([
      ["a", 0, 1],
      ["b", 0, 1],
    ]);
    expect(out[0].cl).not.toBe(out[1].cl);
  });

  it("gives overlapping blocks the first free column", () => {
    const out = c2Lay([tb("a", 9, 120), tb("b", 9.5, 30), tb("c", 10.25, 30)]);
    const col = Object.fromEntries(out.map((x) => [x.b.id, x.col]));
    expect(col).toEqual({ a: 0, b: 1, c: 1 });
    expect(out.every((x) => x.cols === 2)).toBe(true);
  });

  it("lays out by drawn extent: a 15-min block reaches into the next", () => {
    // 15 min = 13px tall, but drawn at least 23px → overlaps a 09:15 block
    expect(c2VEnd({ at: 9, len: 15 })).toBeGreaterThan(9.25);
    const out = c2Lay([tb("a", 9, 15), tb("b", 9.25, 15)]);
    expect(out[0].cl).toBe(out[1].cl);
  });
});

describe("c2Place", () => {
  it("places by percent before the column is measured", () => {
    const { placed, more } = c2Place([tb("a", 9, 60), tb("b", 9, 60)], 0);
    expect(placed.every((x) => x.pct)).toBe(true);
    expect(more).toEqual([]);
    expect(c2PosStyle(placed[1])).toEqual({
      left: "calc(1 * (100% / 2) + 4px)",
      width: "calc(100% / 2 - 8px)",
    });
  });

  it("splits lanes side by side while each stays >= 72px", () => {
    const { placed } = c2Place([tb("a", 9, 60), tb("b", 9, 60)], 200);
    const inner = 192;
    expect(placed.map((x) => [x.left, x.width])).toEqual([
      [4, inner / 2 - 2],
      [4 + inner / 2, inner / 2 - 2],
    ]);
  });

  it("caps side-by-side at 3 and folds the rest into a +N chip", () => {
    const list = ["a", "b", "c", "d", "e"].map((id) => tb(id, 10, 60));
    const { placed, more } = c2Place(list, 400);
    expect(placed).toHaveLength(3);
    expect(more).toHaveLength(1);
    expect(more[0]).toMatchObject({ at: 10, n: 2, width: C2_GUT - 5 });
    expect(more[0].items).toHaveLength(5);
    expect(more[0].hidden.sort()).toEqual(["d", "e"]);
    // chips sit in the gutter right of the narrowed cluster
    expect(more[0].left).toBe(4 + (400 - 8 - C2_GUT) + 3);
  });

  it("never hides the draft", () => {
    const list = [
      ...["a", "b", "c"].map((id) => tb(id, 10, 60)),
      tb("__draft", 10, 60, { draft: true }),
    ];
    const { placed } = c2Place(list, 400);
    expect(placed.some((x) => x.b.id === "__draft")).toBe(true);
  });

  it("cascades a later block in a narrow column", () => {
    const { placed } = c2Place([tb("a", 9, 120), tb("b", 10, 60)], 120);
    const b = placed.find((x) => x.b.id === "b");
    expect(b?.cascade).toBe(true);
    expect(b?.off).toBe(14);
  });
});

describe("agenda", () => {
  const rows: CalBlock[] = [
    { id: "all", date: D, at: null, len: 0, title: "all day" },
    ...["a", "b", "c", "d", "e"].map((id) => tb(id, 10, 30)),
    tb("f", 12, 60),
  ];

  it("folds a half hour past 3 rows into one +N row", () => {
    const out = c2AgendaFold(rows, 3);
    expect(out).toHaveLength(6);
    const more = out.find((r) => r.more);
    expect(more).toMatchObject({ more: true, at: 10, n: 2 });
    expect(more && more.more ? more.items.length : 0).toBe(5);
  });

  it("puts a gap before every timed row and after the last", () => {
    const items = c2WithGaps(c2AgendaFold(rows, 3));
    const gaps = items.filter((i) => i.gap);
    // 3 rows + the fold at 10:00, the 12:00 row, and the end gap
    expect(gaps).toHaveLength(6);
    expect(items[0]).toEqual({ row: { b: rows[0] } });
    expect(items[items.length - 1]).toMatchObject({ gap: true, at: 13 });
  });

  it("times a gap after the row above when there is room", () => {
    const a = { b: tb("a", 9, 30) };
    const b = { b: tb("b", 11, 30) };
    expect(c2GapTime(a, b)).toBe(9.5);
    // no room: halfway, snapped down to 15 min
    expect(c2GapTime({ b: tb("a", 9, 60) }, { b: tb("b", 9.5, 30) })).toBe(
      9.25
    );
    expect(c2GapTime(null, b)).toBe(10.5);
    expect(c2GapTime(a, null)).toBe(9.5);
  });
});

describe("days and hours", () => {
  it("starts the week on Monday or Sunday", () => {
    expect(weekStart("2026-09-01")).toBe("2026-08-31");
    expect(weekStart("2026-09-01", "sunday")).toBe("2026-08-30");
    expect(weekStart("2026-08-31")).toBe("2026-08-31");
  });

  it("labels the prototype's week", () => {
    const days = daySpan("2026-08-31", 7);
    expect(days.map((d) => d.wd)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(days[5].weekend).toBe(true);
    expect(isoWeek("2026-08-31")).toBe(36);
    expect(isoWeek("2027-01-01")).toBe(53);
    expect(spanLabel(days, true)).toBe("31 Aug – 6 Sep · week 36");
    expect(spanLabel(days.slice(1, 4), false)).toBe("1 Sep – 3 Sep");
  });

  it("widens 07–21 to hold early and late blocks", () => {
    expect(hourBounds([])).toEqual({ start: 7, end: 21 });
    expect(
      hourBounds([
        { at: 6.5, len: 30 },
        { at: 21.5, len: 90 },
      ])
    ).toEqual({
      start: 6,
      end: 23,
    });
  });

  it("finds the first free hour from now", () => {
    const blocks = [
      { date: D, at: 14.5, len: 60 },
      { date: D, at: 16, len: 30 },
    ];
    expect(freeSlot(blocks, D, 14.33)).toBe(16.5);
    expect(freeSlot([], D, 14.33)).toBe(14.5);
    expect(freeSlot([], D, 20.5)).toBe(20);
  });

  it("maps a click to its half hour, inside the grid", () => {
    expect(slotAt(0, 7, 21)).toBe(7);
    expect(slotAt(52 * 2 + 30, 7, 21)).toBe(9.5);
    expect(slotAt(99999, 7, 21)).toBe(20);
  });
});
