import { pkClamp, pkCx, pkInverse, pkPlateClass, pkSkyMood } from "../util";

describe("kit helpers", () => {
  it("joins only the classes that are there", () => {
    expect(pkCx("a", false, null, undefined, "b")).toBe("a b");
    expect(pkCx()).toBe("");
  });
  it("clamps", () => {
    expect(pkClamp(5, 0, 1)).toBe(1);
    expect(pkClamp(-5, 0, 1)).toBe(0);
    expect(pkClamp(0.4, 0, 1)).toBe(0.4);
  });
  it("a plate wears the opposite theme in light, a muted dark surface in dark", () => {
    expect(pkInverse("light")).toBe("dark");
    expect(pkInverse("dark")).toBe("paper");
    expect(pkPlateClass("light")).toBe("dark");
    expect(pkPlateClass("dark")).toBe("pk-muted");
  });
  it("the sky follows the app theme and the hour", () => {
    expect(pkSkyMood("light", 7)).toBe("periwinkle");
    expect(pkSkyMood("light", 12)).toBeNull();
    expect(pkSkyMood("light", 17)).toBe("rose");
    expect(pkSkyMood("light", 22)).toBeNull();
    expect(pkSkyMood("dark", 18)).toBe("dusk");
    expect(pkSkyMood("dark", 23)).toBe("night");
    expect(pkSkyMood("dark", 3)).toBe("night");
  });
});
