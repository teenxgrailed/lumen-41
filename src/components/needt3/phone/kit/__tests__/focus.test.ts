import {
  stackDepth,
  stackIsTop,
  stackPush,
  stackRemove,
  trapTarget,
} from "../focus";

describe("sheet stack", () => {
  it("only the top sheet answers; closing the top hands it back", () => {
    const a = stackPush();
    const b = stackPush();
    expect(stackIsTop(b)).toBe(true);
    expect(stackIsTop(a)).toBe(false);
    stackRemove(b);
    expect(stackIsTop(a)).toBe(true);
    stackRemove(a);
    expect(stackDepth()).toBe(0);
  });
  it("a sheet below the top can leave without disturbing the top", () => {
    const a = stackPush();
    const b = stackPush();
    stackRemove(a);
    expect(stackIsTop(b)).toBe(true);
    expect(stackDepth()).toBe(1);
    stackRemove(b);
  });
  it("removing twice is harmless", () => {
    const a = stackPush();
    stackRemove(a);
    stackRemove(a);
    expect(stackDepth()).toBe(0);
  });
});

describe("Tab trap", () => {
  it("wraps from the last to the first and from the first back to the last", () => {
    expect(trapTarget(3, 2, false)).toBe(0);
    expect(trapTarget(3, 0, true)).toBe(2);
  });
  it("lets the browser move inside the trap", () => {
    expect(trapTarget(3, 1, false)).toBeNull();
    expect(trapTarget(3, 1, true)).toBeNull();
  });
  it("pulls focus in from outside", () => {
    expect(trapTarget(3, -1, false)).toBe(0);
    expect(trapTarget(3, -1, true)).toBe(2);
  });
  it("an empty trap does nothing", () => {
    expect(trapTarget(0, -1, false)).toBeNull();
  });
});
