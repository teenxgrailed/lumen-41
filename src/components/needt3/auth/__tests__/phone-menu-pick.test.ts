import {
  DEFAULT_PICK,
  MENU_N,
  clampTravel,
  isDefaultMenu,
  menuToPrefs,
  pickRemove,
  pickToggle,
  prefsToMenu,
  reorder,
  shiftFor,
  slotOver,
} from "../phone-menu-pick";

describe("the saved pill", () => {
  it("falls back to Home · Docs · Ask Needt", () => {
    expect(prefsToMenu(null)).toEqual(["home", "docs", "ask"]);
    expect(prefsToMenu(["home", "docs"])).toEqual([...DEFAULT_PICK]);
    expect(prefsToMenu(["home", "home", "docs"])).toEqual([...DEFAULT_PICK]);
    expect(prefsToMenu(["home", "settings", "docs"])).toEqual([
      ...DEFAULT_PICK,
    ]);
  });
  it("keeps a valid three, in order", () => {
    expect(prefsToMenu(["tasks", "calendar", "ask"])).toEqual([
      "tasks",
      "calendar",
      "ask",
    ]);
  });
  it("writes the desktop's spelling for Home, and only three", () => {
    expect(menuToPrefs(["home", "docs", "ask"])).toEqual([
      "today",
      "docs",
      "ask",
    ]);
    expect(menuToPrefs(["a", "b", "c", "d"])).toHaveLength(MENU_N);
    expect(isDefaultMenu(["home", "docs", "ask"])).toBe(true);
    expect(isDefaultMenu(["docs", "home", "ask"])).toBe(false);
  });
});

describe("tapping sections", () => {
  it("takes the next free slot and says so", () => {
    const r = pickToggle(["home"], "docs");
    expect(r.outcome).toBe("added");
    expect(r.menu).toEqual(["home", "docs"]);
    expect(r.say).toBe("Docs is in slot 2.");
  });
  it("the third one makes the pill ready", () => {
    expect(pickToggle(["home", "docs"], "ask").say).toMatch(/pill is ready/);
  });
  it("a full pill refuses a new section and leaves the list alone", () => {
    const menu = ["home", "docs", "ask"];
    const r = pickToggle(menu, "tasks");
    expect(r.outcome).toBe("full");
    expect(r.menu).toEqual(menu);
    expect(r.menu).not.toBe(menu);
  });
  it("tapping a section that is in takes it out", () => {
    const r = pickToggle(["home", "docs", "ask"], "docs");
    expect(r.outcome).toBe("removed");
    expect(r.menu).toEqual(["home", "ask"]);
    expect(pickRemove(["home"], "home").menu).toEqual([]);
  });
});

describe("dragging a slot", () => {
  // slots 56px wide with a 6px gap: w = 62
  it("lands in the slot the finger has travelled to, inside the pill", () => {
    expect(slotOver(0, 0, 62, 3)).toBe(0);
    expect(slotOver(0, 40, 62, 3)).toBe(1);
    expect(slotOver(0, 400, 62, 3)).toBe(2);
    expect(slotOver(2, -400, 62, 3)).toBe(0);
    // only filled slots count
    expect(slotOver(0, 400, 62, 2)).toBe(1);
    expect(slotOver(1, 10, 0, 3)).toBe(1);
  });
  it("the lifted slot may overshoot the pill by a few px, not more", () => {
    expect(clampTravel(0, -500, 62, 3)).toBe(-8);
    expect(clampTravel(2, 500, 62, 3)).toBe(8);
    expect(clampTravel(1, 30, 62, 3)).toBe(30);
  });
  it("neighbours step aside towards the vacated slot", () => {
    // 0 -> 2: slots 1 and 2 move left
    expect([0, 1, 2].map((k) => shiftFor(k, 0, 2))).toEqual([0, -1, -1]);
    // 2 -> 0: slots 0 and 1 move right
    expect([0, 1, 2].map((k) => shiftFor(k, 2, 0))).toEqual([1, 1, 0]);
    expect([0, 1, 2].map((k) => shiftFor(k, 1, 1))).toEqual([0, 0, 0]);
  });
  it("reorder moves one id and never mutates", () => {
    const menu = ["home", "docs", "ask"];
    expect(reorder(menu, 0, 2)).toEqual(["docs", "ask", "home"]);
    expect(reorder(menu, 2, 0)).toEqual(["ask", "home", "docs"]);
    expect(reorder(menu, 1, 1)).toEqual(menu);
    expect(reorder(menu, 5, 0)).toEqual(menu);
    expect(menu).toEqual(["home", "docs", "ask"]);
  });
});
