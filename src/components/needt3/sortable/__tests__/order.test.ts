import { applyIds, keyTarget, moveOnto, moveTo, sameIds } from "../order";

describe("sortable order logic", () => {
  it("moves an id to an index, clamped, without touching the input", () => {
    const ids = ["a", "b", "c", "d"];
    expect(moveTo(ids, "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveTo(ids, "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveTo(ids, "b", 99)).toEqual(["a", "c", "d", "b"]);
    expect(moveTo(ids, "b", -5)).toEqual(["b", "a", "c", "d"]);
    expect(moveTo(ids, "zzz", 1)).toEqual(ids);
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });

  it("drops an id where the gap is: onto a row below goes after it, above goes before", () => {
    const ids = ["a", "b", "c", "d"];
    expect(moveOnto(ids, "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(moveOnto(ids, "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(moveOnto(ids, "b", "b")).toEqual(ids);
    expect(moveOnto(ids, "b", "nope")).toEqual(ids);
  });

  it("applies a pending order to items; unknown and stale ids are harmless", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(applyIds(items, ["c", "a", "b"]).map((i) => i.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    // a row that arrived after the order was taken keeps its place at the end
    expect(applyIds(items, ["c", "a"]).map((i) => i.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    // a row that is gone is skipped, never invented
    expect(applyIds(items, ["x", "b", "a", "c"]).map((i) => i.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(applyIds(items, null)).toEqual(items);
    expect(sameIds(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameIds(["a", "b"], ["b", "a"])).toBe(false);
  });

  it("maps keys to targets", () => {
    expect(keyTarget("ArrowDown", 1, 4)).toBe(2);
    expect(keyTarget("ArrowRight", 3, 4)).toBe(3);
    expect(keyTarget("ArrowUp", 0, 4)).toBe(0);
    expect(keyTarget("ArrowLeft", 2, 4)).toBe(1);
    expect(keyTarget("Home", 2, 4)).toBe(0);
    expect(keyTarget("End", 1, 4)).toBe(3);
    expect(keyTarget("a", 1, 4)).toBeNull();
  });
});
