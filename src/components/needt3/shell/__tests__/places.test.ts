import { PLAN_LIMITS } from "@/lib/plan-limits";

import {
  DEFAULT_PREFS,
  FREE_DEFAULT_PREFS,
  FREE_UNTILED,
  PLACES,
  TILES_MAX,
  defaultPrefs,
  foldSection,
  mergePrefs,
  moreAlign,
  moreIsWide,
  moveRow,
  orderRows,
  placeForPath,
  prefsFromSettings,
  prefsFromTiles,
  setPlaceOn,
  splitPlaces,
  toggleRow,
} from "../places";

const ids = (list: { id: string }[]) => list.map((p) => p.id);

describe("sidebar layout", () => {
  it("defaults to Home, Calendar, Tasks, Docs, Mailbox as tiles", () => {
    const { tiles, rest } = splitPlaces(DEFAULT_PREFS);
    expect(ids(tiles)).toEqual(["today", "calendar", "tasks", "docs", "mail"]);
    expect(rest).toHaveLength(PLACES.length - TILES_MAX);
  });

  it("every place routes inside the v3 frame (docs stay at /pages)", () => {
    expect(PLACES.find((p) => p.id === "docs")?.href).toBe("/pages");
    expect(PLACES.find((p) => p.id === "today")?.href).toBe("/today");
    for (const p of PLACES) expect(p.href.startsWith("/")).toBe(true);
  });

  it("merge keeps order and choices, appends new places off, drops unknown", () => {
    const merged = mergePrefs({
      places: [
        { id: "mail", on: true },
        { id: "gone", on: true },
        { id: "today", on: false },
        { id: "mail", on: false },
      ],
      collapsed: { projects: true, nope: true },
    });
    expect(merged.places.slice(0, 2)).toEqual([
      { id: "mail", on: true },
      { id: "today", on: false },
    ]);
    expect(merged.places).toHaveLength(PLACES.length);
    expect(merged.places.slice(2).every((p) => !p.on)).toBe(true);
    expect(merged.collapsed).toEqual({ projects: true });
    expect(ids(merged.sections)).toEqual(["starred", "projects"]);
  });

  it("garbage falls back to the default", () => {
    expect(mergePrefs(null)).toBe(DEFAULT_PREFS);
    expect(mergePrefs([1, 2])).toBe(DEFAULT_PREFS);
    expect(mergePrefs({}).places).toEqual(DEFAULT_PREFS.places);
  });

  it("onboarding's tile list: first five on, rest off, in order", () => {
    const p = prefsFromTiles([
      "habits",
      "today",
      "mail",
      "nope",
      "habits",
      "docs",
      "trash",
      "projects",
    ]);
    expect(p).not.toBeNull();
    const { tiles, rest } = splitPlaces(p!);
    expect(ids(tiles)).toEqual(["habits", "today", "mail", "docs", "trash"]);
    expect(ids(rest)[0]).toBe("projects");
    expect(p!.places).toHaveLength(PLACES.length);
    expect(prefsFromTiles([])).toBeNull();
    expect(prefsFromTiles("today")).toBeNull();
  });

  it("a saved layout wins over onboarding's list", () => {
    const saved = setPlaceOn(DEFAULT_PREFS, "habits", true);
    const p = prefsFromSettings({ sidebar: saved, sidebarTiles: ["trash"] });
    expect(splitPlaces(p).tiles.map((t) => t.id)).toContain("habits");
    expect(
      splitPlaces(prefsFromSettings({ sidebarTiles: ["trash"] })).tiles
    ).toHaveLength(1);
    expect(prefsFromSettings(undefined)).toBe(DEFAULT_PREFS);
  });

  it("toggle, reorder and fold", () => {
    const hidden = toggleRow(DEFAULT_PREFS, "places", "mail");
    expect(splitPlaces(hidden).tiles.map((t) => t.id)).not.toContain("mail");
    const moved = moveRow(DEFAULT_PREFS, "places", "mail", "today");
    expect(ids(moved.places).slice(0, 2)).toEqual(["mail", "today"]);
    expect(moveRow(DEFAULT_PREFS, "places", "x", "today")).toEqual(
      DEFAULT_PREFS
    );
    const sec = toggleRow(DEFAULT_PREFS, "sections", "starred");
    expect(sec.sections[0]).toEqual({ id: "starred", on: false });
    const swapped = moveRow(DEFAULT_PREFS, "sections", "projects", "starred");
    expect(ids(swapped.sections)).toEqual(["projects", "starred"]);
    const shut = foldSection(DEFAULT_PREFS, "projects");
    expect(shut.collapsed.projects).toBe(true);
    expect(foldSection(shut, "projects").collapsed).toEqual({});
  });

  it("More sits on its own wide row after a full row of tiles", () => {
    expect(moreIsWide(0)).toBe(false);
    expect(moreIsWide(5)).toBe(false);
    expect(moreIsWide(3)).toBe(true);
    expect(moreIsWide(6)).toBe(true);
    expect(moreAlign(5)).toBe("right");
    expect(moreAlign(4)).toBe("left");
  });

  it("finds the place of a path; a doc belongs to Docs", () => {
    expect(placeForPath("/pages/abc")).toBe("docs");
    expect(placeForPath("/projects")).toBe("projects");
    expect(placeForPath("/projects/p1")).toBe("projects");
    expect(placeForPath("/tasksx")).toBeNull();
    expect(placeForPath("/connections")).toBeNull();
  });
});

describe("Free plan layout", () => {
  it("Free has no mailboxes, so Mailbox is the place kept off the tiles", () => {
    expect(PLAN_LIMITS.FREE.mailboxes).toBe(0);
    expect(FREE_UNTILED).toEqual(["mail"]);
  });

  it("Free's default puts Mailbox under More and Projects on the tiles", () => {
    const { tiles, rest } = splitPlaces(prefsFromSettings(undefined, true));
    expect(ids(tiles)).toEqual([
      "today",
      "calendar",
      "tasks",
      "docs",
      "projects",
    ]);
    expect(tiles).toHaveLength(TILES_MAX);
    expect(ids(rest)[0]).toBe("mail");
    expect(defaultPrefs(true)).toBe(FREE_DEFAULT_PREFS);
  });

  it("paid, trial and an unknown plan keep Mailbox on the tiles", () => {
    expect(defaultPrefs(false)).toBe(DEFAULT_PREFS);
    expect(prefsFromSettings(undefined)).toBe(DEFAULT_PREFS);
    expect(ids(splitPlaces(prefsFromSettings({}, false)).tiles)).toContain(
      "mail"
    );
  });

  it("onboarding's list on Free skips Mailbox and fills the fifth tile", () => {
    const { tiles, rest } = splitPlaces(
      prefsFromSettings(
        {
          sidebarTiles: [
            "mail",
            "today",
            "tasks",
            "habits",
            "docs",
            "calendar",
          ],
        },
        true
      )
    );
    expect(ids(tiles)).toEqual([
      "today",
      "tasks",
      "habits",
      "docs",
      "calendar",
    ]);
    expect(ids(rest)[0]).toBe("mail");
  });

  it("a layout the person saved is left as they set it, even on Free", () => {
    const saved = {
      sidebar: {
        places: [
          { id: "mail", on: true },
          { id: "today", on: true },
        ],
      },
    };
    const { tiles } = splitPlaces(prefsFromSettings(saved, true));
    expect(ids(tiles)).toEqual(["mail", "today"]);
  });
});

describe("orderRows", () => {
  it("applies a full id order to places or sections, leaving the other list alone", () => {
    const rev = ids(DEFAULT_PREFS.places).reverse();
    const next = orderRows(DEFAULT_PREFS, "places", rev);
    expect(ids(next.places)).toEqual(rev);
    expect(next.sections).toEqual(DEFAULT_PREFS.sections);
    const sec = orderRows(DEFAULT_PREFS, "sections", ["projects", "starred"]);
    expect(ids(sec.sections)).toEqual(["projects", "starred"]);
  });

  it("keeps rows the order does not name, after the named ones", () => {
    const next = orderRows(DEFAULT_PREFS, "places", ["mail"]);
    expect(next.places[0].id).toBe("mail");
    expect(next.places).toHaveLength(DEFAULT_PREFS.places.length);
  });
});
