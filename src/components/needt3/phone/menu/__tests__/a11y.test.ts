/**
 * @jest-environment jsdom
 */
import { menuFocusMove, menuIsOpen, setInert } from "../a11y";

describe("menuIsOpen", () => {
  it("card and full are open, handle and pill are not", () => {
    expect(menuIsOpen("card")).toBe(true);
    expect(menuIsOpen("full")).toBe(true);
    expect(menuIsOpen("pill")).toBe(false);
    expect(menuIsOpen("hidden")).toBe(false);
  });
});

describe("menuFocusMove", () => {
  it("opening lands on the first tile", () => {
    expect(menuFocusMove("pill", "card")).toBe("tile");
    expect(menuFocusMove("pill", "full")).toBe("tile");
    expect(menuFocusMove("hidden", "card")).toBe("tile");
  });

  it("closing to the pill returns to the Every place button", () => {
    expect(menuFocusMove("card", "pill")).toBe("dots");
    expect(menuFocusMove("full", "pill")).toBe("dots");
  });

  it("moving inside the open stops, or inside the closed ones, leaves focus", () => {
    expect(menuFocusMove("card", "full")).toBeNull();
    expect(menuFocusMove("full", "card")).toBeNull();
    expect(menuFocusMove("pill", "hidden")).toBeNull();
    expect(menuFocusMove("hidden", "pill")).toBeNull();
    expect(menuFocusMove("pill", "pill")).toBeNull();
  });

  it("tucking away from the card has no control to return to", () => {
    expect(menuFocusMove("card", "hidden")).toBeNull();
  });
});

describe("setInert", () => {
  it("sets and clears the attribute", () => {
    const el = document.createElement("main");
    setInert(el, true);
    expect(el.hasAttribute("inert")).toBe(true);
    setInert(el, true);
    expect(el.hasAttribute("inert")).toBe(true);
    setInert(el, false);
    expect(el.hasAttribute("inert")).toBe(false);
  });

  it("ignores a missing element", () => {
    expect(() => setInert(null, true)).not.toThrow();
    expect(() => setInert(undefined, false)).not.toThrow();
  });
});
