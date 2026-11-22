import { rankedPlaces } from "@/lib/needt3/nav-rank";

import {
  BAR_PLACE_SLOTS,
  DEFAULT_TILES,
  barPlaces,
  barStyleFrom,
  menuTilesRanked,
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
  it("with the default ranking returns the defaults, then the ranked rest", () => {
    expect(barPlaces(rankedPlaces({}), 3)).toEqual([...DEFAULT_TILES]);
    expect(barPlaces(rankedPlaces({}), 5)).toEqual([
      "home",
      "docs",
      "ask",
      "calendar",
      "tasks",
    ]);
  });

  it("takes the ranked order, then fills from the defaults", () => {
    expect(barPlaces(["mail", "today"], 5)).toEqual([
      "mail",
      "home",
      "docs",
      "ask",
      "calendar",
    ]);
  });

  it("follows the ranking a weekly reorder applied", () => {
    const prefs = { navOrder: ["tasks", "calendar", "today"] };
    expect(barPlaces(rankedPlaces(prefs), BAR_PLACE_SLOTS)).toEqual([
      "tasks",
      "calendar",
      "home",
    ]);
  });

  it("keeps a pinned place where it is", () => {
    const prefs = {
      navOrder: ["mail", "today", "docs", "ask"],
      navPinned: ["mail"],
    };
    expect(barPlaces(rankedPlaces(prefs), BAR_PLACE_SLOTS)[0]).toBe("mail");
  });

  it("reads the ranked spellings and drops unknown ids, repeats and places the pill does not take", () => {
    expect(
      barPlaces(["moodboards", "nope", "moodboards", "trash", "today"], 4)
    ).toEqual(["moodboards", "home", "docs", "ask"]);
  });

  it("never offers Settings, Agents or Budget", () => {
    const all = barPlaces(["settings", "agents", "budget"], 50);
    expect(all).not.toContain("settings");
    expect(all).not.toContain("agents");
    expect(all).not.toContain("budget");
    expect(new Set(all).size).toBe(all.length);
  });

  it("clamps the count", () => {
    expect(barPlaces(rankedPlaces({}), 0)).toEqual([]);
    expect(barPlaces(rankedPlaces({}), -2)).toEqual([]);
    expect(barPlaces(rankedPlaces({}), 2.7)).toEqual(["home", "docs"]);
  });

  it("holds the same three as the classic pill", () => {
    const ranked = rankedPlaces({ navOrder: ["calendar", "tasks", "mail"] });
    expect(barPlaces(ranked, BAR_PLACE_SLOTS)).toEqual(menuTilesRanked(ranked));
    expect(barPlaces(rankedPlaces({}), BAR_PLACE_SLOTS)).toEqual(
      menuTilesRanked(rankedPlaces({}))
    );
  });
});
