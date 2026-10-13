import { applyOrderSlots, moveId, sameOrder } from "../board-order";

describe("applyOrderSlots (the server's reorder rule, mirrored)", () => {
  it("lists everything: that is the new order", () => {
    expect(applyOrderSlots(["a", "b", "c"], ["c", "a", "b"])).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("gives the listed ones the places the listed ones held; the rest stay put", () => {
    expect(applyOrderSlots(["a", "b", "c", "d"], ["d", "b"])).toEqual([
      "a",
      "d",
      "c",
      "b",
    ]);
  });

  it("ignores nothing it was not asked about and changes nothing for an unchanged list", () => {
    expect(applyOrderSlots(["a", "b", "c"], ["a", "c"])).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(applyOrderSlots(["a", "b"], [])).toEqual(["a", "b"]);
  });
});

describe("moveId", () => {
  it("takes the target's place: down, up, to the ends", () => {
    expect(moveId(["a", "b", "c", "d"], "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveId(["a", "b", "c", "d"], "d", 1)).toEqual(["a", "d", "b", "c"]);
    expect(moveId(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(moveId(["a", "b", "c"], "a", 99)).toEqual(["b", "c", "a"]);
    expect(moveId(["a", "b", "c"], "a", -5)).toEqual(["a", "b", "c"]);
  });

  it("leaves the list alone for an id it does not hold, and never mutates", () => {
    const list = ["a", "b"];
    expect(moveId(list, "z", 0)).toEqual(["a", "b"]);
    moveId(list, "b", 0);
    expect(list).toEqual(["a", "b"]);
  });

  it("compares orders", () => {
    expect(sameOrder(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameOrder(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameOrder(["a"], ["a", "b"])).toBe(false);
  });
});
