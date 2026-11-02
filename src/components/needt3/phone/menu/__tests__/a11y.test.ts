/**
 * @jest-environment jsdom
 */
import { blockScreen, menuFocusMove, menuIsOpen } from "../a11y";

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

describe("blockScreen", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("hides the host from assistive tech and marks it, then undoes both", () => {
    const host = document.createElement("main");
    document.body.appendChild(host);
    const undo = blockScreen(host, () => undefined);
    expect(host.getAttribute("aria-hidden")).toBe("true");
    expect(host.hasAttribute("data-nva-blocked")).toBe(true);
    expect(host.hasAttribute("inert")).toBe(false);
    undo();
    expect(host.hasAttribute("aria-hidden")).toBe(false);
    expect(host.hasAttribute("data-nva-blocked")).toBe(false);
  });

  it("hands focus back when it lands in the host, and not for anything outside", () => {
    const host = document.createElement("main");
    const inside = document.createElement("button");
    const outside = document.createElement("button");
    host.appendChild(inside);
    document.body.append(host, outside);
    const refocus = jest.fn();
    const undo = blockScreen(host, refocus);
    outside.focus();
    expect(refocus).not.toHaveBeenCalled();
    inside.focus();
    expect(refocus).toHaveBeenCalledTimes(1);
    undo();
    inside.focus();
    expect(refocus).toHaveBeenCalledTimes(1);
  });

  it("takes focus out of the host at once when it is already there", () => {
    const host = document.createElement("main");
    const inside = document.createElement("button");
    host.appendChild(inside);
    document.body.appendChild(host);
    inside.focus();
    const refocus = jest.fn();
    blockScreen(host, refocus)();
    expect(refocus).toHaveBeenCalledTimes(1);
  });

  it("ignores a missing element", () => {
    expect(() => blockScreen(null, () => undefined)()).not.toThrow();
    expect(() => blockScreen(undefined, () => undefined)()).not.toThrow();
  });
});
