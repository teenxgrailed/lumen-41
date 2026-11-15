import {
  BAR_PLACE_SLOTS,
  DEFAULT_TILES,
  barPlaces,
  barStyleFrom,
  menuTilesFrom,
} from "../places";

describe("barStyleFrom", () => {
  it("is classic unless float is saved", () => {
    expect(barStyleFrom(undefined)).toBe("classic");
    expect(barStyleFrom(null)).toBe("classic");
    expect(barStyleFrom({})).toBe("classic");
    expect(barStyleFrom({ barStyle: "classic" })).toBe("classic");
    expect(barStyleFrom({ barStyle: "float" })).toBe("float");
    expect(barStyleFrom({ barStyle: "FLOAT" })).toBe("classic");
    expect(barStyleFrom({ barStyle: 1 })).toBe("classic");
  });
});

describe("barPlaces", () => {
  it("with nothing saved returns the defaults, then the rest in menu order", () => {
    expect(barPlaces(undefined, 3)).toEqual([...DEFAULT_TILES]);
    expect(barPlaces({}, 5)).toEqual([
      "home",
      "docs",
      "ask",
      "calendar",
      "tasks",
    ]);
  });

  it("puts the saved list first, in its order, then fills from the defaults", () => {
    expect(barPlaces({ mobileTiles: ["mail", "today"] }, 5)).toEqual([
      "mail",
      "home",
      "docs",
      "ask",
      "calendar",
    ]);
  });

  it("reads the desktop spellings and drops unknown ids and repeats", () => {
    expect(
      barPlaces({ mobileTiles: ["boards", "nope", "boards", 7, "today"] }, 4)
    ).toEqual(["moodboards", "home", "docs", "ask"]);
  });

  it("never offers Settings, Agents or Budget", () => {
    const all = barPlaces({ mobileTiles: ["settings"] }, 50);
    expect(all).not.toContain("settings");
    expect(all).not.toContain("agents");
    expect(all).not.toContain("budget");
    expect(new Set(all).size).toBe(all.length);
  });

  it("clamps the count", () => {
    expect(barPlaces({}, 0)).toEqual([]);
    expect(barPlaces({}, -2)).toEqual([]);
    expect(barPlaces({}, 2.7)).toEqual(["home", "docs"]);
  });

  it("holds the same places as the classic pill when the saved list is full", () => {
    const prefs = { mobileTiles: ["calendar", "tasks", "mail"] };
    expect(barPlaces(prefs, BAR_PLACE_SLOTS)).toEqual(menuTilesFrom(prefs));
    expect(barPlaces({}, BAR_PLACE_SLOTS)).toEqual(menuTilesFrom({}));
  });
});
