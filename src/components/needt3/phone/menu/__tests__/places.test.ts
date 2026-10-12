import { PLACES } from "../../../shell/places";
import {
  CONNECTIONS_HREF,
  DEFAULT_TILES,
  MENU_ORDER,
  menuAction,
  menuGlyphId,
  menuIdForPath,
  menuRows,
  menuSub,
  menuTilesFrom,
  menuWord,
} from "../places";

describe("menu places and the route map", () => {
  it("every routed place takes its href from the shell registry", () => {
    for (const id of MENU_ORDER) {
      const a = menuAction(id);
      if (a.kind !== "route") continue;
      if (id === "connections") expect(a.href).toBe(CONNECTIONS_HREF);
      else expect(PLACES.map((p) => p.href)).toContain(a.href);
    }
  });

  it("home is /today, docs is /pages (the URL stayed), boards are /moodboards", () => {
    expect(menuAction("home")).toEqual({ kind: "route", href: "/today" });
    expect(menuAction("docs")).toEqual({ kind: "route", href: "/pages" });
    expect(menuAction("moodboards")).toEqual({
      kind: "route",
      href: "/moodboards",
    });
    expect(menuAction("connections")).toEqual({
      kind: "route",
      href: "/connections",
    });
  });

  it("Ask Needt and Settings are not places: they open a layer", () => {
    expect(menuAction("ask")).toEqual({ kind: "ask" });
    expect(menuAction("settings")).toEqual({ kind: "settings" });
  });

  it("the order is the prototype's: 14 entries, Settings last", () => {
    expect(MENU_ORDER).toHaveLength(14);
    expect(new Set(MENU_ORDER).size).toBe(14);
    expect(MENU_ORDER[MENU_ORDER.length - 1]).toBe("settings");
    expect(MENU_ORDER.slice(0, 6)).toEqual([
      "home",
      "calendar",
      "tasks",
      "docs",
      "mail",
      "ask",
    ]);
  });
});

describe("words and subs", () => {
  it("the big word of each row", () => {
    expect(menuWord("home")).toBe("Home");
    expect(menuWord("mail")).toBe("Mailbox");
    expect(menuWord("moodboards")).toBe("Boards");
    expect(menuWord("ask")).toBe("Ask Needt");
    expect(menuWord("settings")).toBe("Settings");
    expect(menuWord("connections")).toBe("Connections");
    for (const id of MENU_ORDER) expect(menuWord(id).length).toBeGreaterThan(0);
  });

  it("a row with nothing loaded says what the place is for", () => {
    for (const id of MENU_ORDER) expect(menuSub(id).length).toBeGreaterThan(0);
    expect(menuSub("docs")).toBe("Pages and notes");
  });
});

describe("menuIdForPath", () => {
  it("maps a pathname to the place it belongs to", () => {
    expect(menuIdForPath("/today")).toBe("home");
    expect(menuIdForPath("/calendar")).toBe("calendar");
    expect(menuIdForPath("/pages")).toBe("docs");
    expect(menuIdForPath("/pages/abc")).toBe("docs");
    expect(menuIdForPath("/moodboards/42")).toBe("moodboards");
    expect(menuIdForPath("/projects/p1")).toBe("projects");
    expect(menuIdForPath("/connections")).toBe("connections");
    expect(menuIdForPath("/trash")).toBe("trash");
  });

  it("anything else is no place (Settings is a sheet, not a route)", () => {
    expect(menuIdForPath("/settings")).toBeNull();
    expect(menuIdForPath("/focus")).toBeNull();
    expect(menuIdForPath("")).toBeNull();
  });
});

describe("menuTilesFrom", () => {
  it("defaults to Home, Docs, Ask Needt", () => {
    expect(menuTilesFrom(undefined)).toEqual(["home", "docs", "ask"]);
    expect(menuTilesFrom({})).toEqual([...DEFAULT_TILES]);
    expect(menuTilesFrom({ mobileTiles: [] })).toEqual([...DEFAULT_TILES]);
    expect(menuTilesFrom({ mobileTiles: "home" })).toEqual([...DEFAULT_TILES]);
  });

  it("takes the first three the person saved, in the desktop's spellings too", () => {
    expect(
      menuTilesFrom({ mobileTiles: ["today", "tasks", "boards", "mail"] })
    ).toEqual(["home", "tasks", "moodboards"]);
    expect(menuTilesFrom({ mobileTiles: ["calendar", "mail", "ask"] })).toEqual(
      ["calendar", "mail", "ask"]
    );
  });

  it("skips unknown and repeated ids, and Settings is never one of the three", () => {
    expect(
      menuTilesFrom({
        mobileTiles: ["tasks", "tasks", "nope", 3, "settings", "docs", "mail"],
      })
    ).toEqual(["tasks", "docs", "mail"]);
  });

  it("fewer than three usable ids falls back to the default", () => {
    expect(menuTilesFrom({ mobileTiles: ["tasks", "docs"] })).toEqual([
      ...DEFAULT_TILES,
    ]);
  });
});

describe("menuRows / menuGlyphId", () => {
  it("rows are every place that is not one of the three, in order", () => {
    const rows = menuRows(["home", "docs", "ask"]);
    expect(rows).not.toContain("home");
    expect(rows).not.toContain("docs");
    expect(rows).not.toContain("ask");
    expect(rows).toHaveLength(11);
    expect(rows[0]).toBe("calendar");
    expect(rows[rows.length - 1]).toBe("settings");
  });

  it("the rail's drawn marks are reused; the rest are the menu's own", () => {
    expect(menuGlyphId("home")).toBe("today");
    expect(menuGlyphId("moodboards")).toBe("moodboards");
    expect(menuGlyphId("habits")).toBe("habits");
    for (const id of [
      "ask",
      "templates",
      "shared",
      "trash",
      "connections",
      "settings",
    ] as const)
      expect(menuGlyphId(id)).toBeNull();
  });
});
