import { menuTilesRanked } from "@/components/needt3/phone/menu/places";
import { prefsFromRanked } from "@/components/needt3/shell/places";
import { DEFAULT_PREFS } from "@/components/needt3/shell/places";

import {
  DEFAULT_NAV_ORDER,
  MIN_TOTAL_OPENS,
  NAV_TIPS,
  type NavId,
  type NavUsage,
  afterOpen,
  applyPendingPatch,
  baseOrder,
  currentOrder,
  effectiveOrder,
  movedUp,
  normalizeOrder,
  opensInWindow,
  pickTip,
  rankPlaces,
  rankedPlaces,
  recordOpen,
  repin,
  savedLayouts,
  seedOrder,
  togglePin,
  undoReorderPatch,
  withMailRule,
} from "../nav-rank";

const NOW = new Date("2026-11-15T12:00:00Z");
const BASE = DEFAULT_NAV_ORDER.slice();

/** `counts` all on today's date. */
const today = (counts: Partial<Record<NavId, number>>): NavUsage => ({
  "2026-11-15": counts,
});

describe("rankPlaces", () => {
  it("keeps the order below the total threshold", () => {
    const usage = today({ trash: MIN_TOTAL_OPENS - 1 });
    expect(rankPlaces(usage, [], BASE, NOW)).toEqual(BASE);
  });

  it("does not reshuffle for a single open", () => {
    expect(rankPlaces(today({ habits: 1 }), [], BASE, NOW)).toEqual(BASE);
  });

  it("moves the most opened places to the front", () => {
    const usage = today({ habits: 8, tasks: 5 });
    const out = rankPlaces(usage, [], BASE, NOW);
    expect(out.slice(0, 2)).toEqual(["habits", "tasks"]);
    // the rest keep their old order
    expect(out.slice(2)).toEqual(
      BASE.filter((id) => id !== "habits" && id !== "tasks")
    );
  });

  it("needs a minimum per place before it can move up", () => {
    const usage = today({ habits: 10, goals: 2 });
    const out = rankPlaces(usage, [], BASE, NOW);
    expect(out[0]).toBe("habits");
    // two opens of Goals move nothing: everything else keeps its order
    expect(out.slice(1)).toEqual(BASE.filter((id) => id !== "habits"));
  });

  it("keeps the old order on ties", () => {
    const usage = today({ habits: 5, goals: 5, moodboards: 5 });
    const out = rankPlaces(usage, [], BASE, NOW);
    // goals, moodboards, habits is BASE's order among the three
    expect(out.slice(0, 3)).toEqual(["goals", "moodboards", "habits"]);
  });

  it("never moves a pinned place", () => {
    const usage = today({ habits: 9, projects: 6 });
    const out = rankPlaces(usage, ["today", "ask"], BASE, NOW);
    expect(out[0]).toBe("today");
    expect(out.indexOf("ask")).toBe(BASE.indexOf("ask"));
    expect(out[1]).toBe("habits");
    expect(out[3]).toBe("projects");
    expect(new Set(out).size).toBe(BASE.length);
  });

  it("keeps a pinned place in its slot even when it is opened a lot", () => {
    const usage = today({ trash: 20 });
    const out = rankPlaces(usage, ["trash"], BASE, NOW);
    expect(out).toEqual(BASE);
  });

  it("only counts the last 14 days", () => {
    const usage: NavUsage = {
      "2026-11-01": { habits: 50 }, // 15th day back: out
      "2026-11-02": { goals: 12 }, // 14th day back: in
    };
    const out = rankPlaces(usage, [], BASE, NOW);
    expect(out[0]).toBe("goals");
    expect(out.indexOf("habits")).toBeGreaterThan(0);
    expect(opensInWindow(usage, NOW)).toEqual({ goals: 12 });
  });

  it("returns every place once, with unknown ids dropped from base", () => {
    const out = rankPlaces(
      today({ tasks: 12 }),
      [],
      ["tasks", "nope" as NavId, "tasks"],
      NOW
    );
    expect(out[0]).toBe("tasks");
    expect([...out].sort()).toEqual([...BASE].sort());
  });
});

describe("recordOpen", () => {
  it("counts and trims to 14 days", () => {
    let u: NavUsage = { "2026-10-01": { tasks: 3 }, "2026-11-10": { docs: 1 } };
    u = recordOpen(u, "docs", "2026-11-15");
    u = recordOpen(u, "docs", "2026-11-15");
    expect(u).toEqual({
      "2026-11-10": { docs: 1 },
      "2026-11-15": { docs: 2 },
    });
  });
});

describe("baseOrder", () => {
  it("falls back to the default", () => {
    expect(baseOrder(undefined)).toEqual(BASE);
    expect(baseOrder(["unknown"])).toEqual(BASE);
  });

  it("starts from the onboarding answers, Home first and Ask third", () => {
    const work = baseOrder(["work"]);
    expect(work.slice(0, 5)).toEqual([
      "today",
      "calendar",
      "ask",
      "tasks",
      "projects",
    ]);
    const personal = baseOrder(["personal", "side"]);
    expect(personal.slice(0, 4)).toEqual(["today", "tasks", "ask", "projects"]);
    expect(new Set(personal).size).toBe(BASE.length);
  });
});

describe("weekly ranking on the server (afterOpen)", () => {
  it("only counts in the first week", () => {
    const patch = afterOpen({}, "tasks", NOW);
    expect(patch.navRankedAt).toBe(NOW.toISOString());
    expect(patch.navOrderPending).toBeUndefined();
  });

  it("does not rank again within the week", () => {
    const prefs = {
      navRankedAt: "2026-11-12T00:00:00Z",
      navUsage: today({ habits: 30 }),
    };
    const patch = afterOpen(prefs, "habits", NOW);
    expect(patch.navOrderPending).toBeUndefined();
    expect(patch.navRankedAt).toBeUndefined();
  });

  it("ranks after a week into a pending order", () => {
    const prefs = {
      navRankedAt: "2026-11-07T00:00:00Z",
      navUsage: today({ habits: 30 }),
    };
    const patch = afterOpen(prefs, "habits", NOW) as {
      navOrderPending: { order: NavId[]; moved: NavId };
    };
    expect(patch.navOrderPending.order[0]).toBe("habits");
    expect(patch.navOrderPending.moved).toBe("habits");
  });

  it("does not touch the applied order (no live reshuffle)", () => {
    const prefs = {
      navRankedAt: "2026-11-07T00:00:00Z",
      navUsage: today({ habits: 30 }),
    };
    const patch = afterOpen(prefs, "habits", NOW);
    expect(patch.navOrder).toBeUndefined();
  });

  it("leaves no pending order when nothing changes", () => {
    const prefs = { navRankedAt: "2026-11-01T00:00:00Z" };
    expect(afterOpen(prefs, "today", NOW).navOrderPending).toBeUndefined();
  });
});

describe("applying, undoing, pins", () => {
  const pending = {
    order: ["habits", ...BASE.filter((id) => id !== "habits")],
    moved: "habits",
    at: NOW.toISOString(),
  };

  it("counts a pending order as the order of this load", () => {
    expect(effectiveOrder({ navOrderPending: pending })[0]).toBe("habits");
    expect(currentOrder({ navOrderPending: pending })).toEqual(BASE);
  });

  it("applies a pending order with its tip", () => {
    const patch = applyPendingPatch({ navOrderPending: pending }, "2026-11-15");
    expect(patch).toEqual({
      navOrder: pending.order,
      navOrderPrev: BASE,
      navOrderPending: null,
      navReorderTip: { moved: "habits", day: "2026-11-15" },
    });
    expect(applyPendingPatch({}, "2026-11-15")).toBeNull();
  });

  it("undo restores the previous order and pins nothing", () => {
    const prefs = { navOrder: pending.order, navOrderPrev: BASE };
    const undo = undoReorderPatch(prefs, NOW)!;
    expect(undo.navOrder).toEqual(BASE);
    expect(undo).not.toHaveProperty("navPinned");
    expect(undoReorderPatch({}, NOW)).toBeNull();
  });

  it("toggles a pin", () => {
    expect(togglePin({}, "tasks")).toEqual(["tasks"]);
    expect(togglePin({ navPinned: ["tasks", "docs"] }, "tasks")).toEqual([
      "docs",
    ]);
  });

  it("movedUp names the place that rose the most", () => {
    expect(movedUp(BASE, pending.order as NavId[])).toBe("habits");
    expect(movedUp(BASE, BASE)).toBeNull();
  });

  it("normalizes a broken stored order", () => {
    expect(normalizeOrder("x")).toEqual(BASE);
  });
});

describe("rankedPlaces and the surfaces", () => {
  it("keeps Mailbox off Free's first five unless pinned", () => {
    const prefs = { navOrder: ["mail", "today"] };
    expect(rankedPlaces(prefs, { free: true }).indexOf("mail")).toBe(5);
    expect(rankedPlaces(prefs, { free: false })[0]).toBe("mail");
    expect(
      rankedPlaces({ ...prefs, navPinned: ["mail"] }, { free: true })[0]
    ).toBe("mail");
  });

  it("gives the phone today's three by default", () => {
    expect(menuTilesRanked(rankedPlaces({}))).toEqual(["home", "docs", "ask"]);
  });

  it("skips places the pill does not take", () => {
    expect(
      menuTilesRanked(["trash", "templates", "goals", "tasks", "ask", "docs"])
    ).toEqual(["tasks", "ask", "docs"]);
  });

  it("gives the desktop five tiles in ranked order, Ask skipped", () => {
    const prefs = prefsFromRanked(rankedPlaces({}), DEFAULT_PREFS);
    expect(prefs.places.filter((p) => p.on).map((p) => p.id)).toEqual([
      "today",
      "docs",
      "calendar",
      "tasks",
      "mail",
    ]);
    expect(prefs.places).toHaveLength(DEFAULT_PREFS.places.length);
    expect(prefs.sections).toEqual(DEFAULT_PREFS.sections);
  });
});

describe("pickTip", () => {
  it("shows the reorder tip once", () => {
    const prefs = { navReorderTip: { moved: "habits", day: "2026-11-15" } };
    const pick = pickTip(prefs, "2026-11-15");
    expect(pick?.kind).toBe("reorder");
    const after = { ...prefs, ...pick!.patch };
    // the same day: no change tip either
    expect(pickTip(after, "2026-11-15")).toBeNull();
  });

  it("shows at most one change tip a week, in turn", () => {
    const first = pickTip({}, "2026-11-15");
    expect(first?.kind).toBe("tip");
    if (first?.kind !== "tip") throw new Error("tip");
    expect(first.tip).toBe(NAV_TIPS[0]);
    const prefs = first.patch;
    expect(pickTip(prefs, "2026-11-16")).toBeNull();
    expect(pickTip(prefs, "2026-11-21")).toBeNull();
    const next = pickTip(prefs, "2026-11-22");
    if (next?.kind !== "tip") throw new Error("tip");
    expect(next.tip).toBe(NAV_TIPS[1]);
  });

  it("never shows a change tip on the day of a reorder tip", () => {
    const prefs = {
      navReorderTip: { moved: "habits", day: "2026-11-15", shown: true },
    };
    expect(pickTip(prefs, "2026-11-15")).toBeNull();
    expect(pickTip(prefs, "2026-11-16")?.kind).toBe("tip");
  });
});

describe("saved layouts seed the order (no navOrder yet)", () => {
  const desktopTiles = (prefs: unknown) =>
    prefsFromRanked(rankedPlaces(prefs), DEFAULT_PREFS)
      .places.filter((p) => p.on)
      .map((p) => p.id);

  it("keeps a saved sidebar: its tiles, in order; hidden places off the tiles", () => {
    const prefs = {
      sidebar: {
        places: [
          { id: "habits", on: true },
          { id: "goals", on: true },
          { id: "tasks", on: true },
          { id: "today", on: false },
          { id: "docs", on: false },
          { id: "calendar", on: false },
        ],
      },
    };
    const tiles = desktopTiles(prefs);
    expect(tiles.slice(0, 3)).toEqual(["habits", "goals", "tasks"]);
    expect(tiles).not.toContain("today");
    expect(tiles).not.toContain("docs");
    expect(tiles).not.toContain("calendar");
    // the hidden ones come last, in their saved order
    expect(seedOrder(prefs).slice(-3)).toEqual(["today", "docs", "calendar"]);
  });

  it("keeps the phone's saved three in the pill", () => {
    const prefs = { mobileTiles: ["tasks", "boards", "ask"] };
    expect(menuTilesRanked(rankedPlaces(prefs))).toEqual([
      "tasks",
      "moodboards",
      "ask",
    ]);
  });

  it("keeps both when both are saved", () => {
    const prefs = {
      mobileTiles: ["home", "calendar", "ask"],
      sidebar: {
        places: [
          { id: "today", on: true },
          { id: "projects", on: true },
          { id: "calendar", on: true },
          { id: "mail", on: true },
          { id: "habits", on: true },
          { id: "docs", on: false },
        ],
      },
    };
    expect(menuTilesRanked(rankedPlaces(prefs))).toEqual([
      "home",
      "calendar",
      "ask",
    ]);
    expect([...desktopTiles(prefs)].sort()).toEqual(
      ["today", "projects", "calendar", "mail", "habits"].sort()
    );
  });

  it("a desktop-hidden place does not lead the pill", () => {
    const prefs = {
      mobileTiles: ["docs", "tasks", "ask"],
      sidebar: { places: [{ id: "docs", on: false }] },
    };
    expect(seedOrder(prefs).slice(0, 2)).toEqual(["tasks", "ask"]);
    expect(desktopTiles(prefs)).not.toContain("docs");
  });

  it("reads onboarding's sidebarTiles when no layout was saved", () => {
    const prefs = { sidebarTiles: ["goals", "habits", "tasks"] };
    expect(desktopTiles(prefs).slice(0, 3)).toEqual([
      "goals",
      "habits",
      "tasks",
    ]);
  });

  it("ignores a short or broken saved list", () => {
    expect(savedLayouts({ mobileTiles: ["tasks"] }).pill).toEqual([]);
    expect(seedOrder({ mobileTiles: "x", sidebar: 3 })).toEqual(BASE);
  });

  it("an applied order wins over the saved layouts", () => {
    const prefs = {
      navOrder: BASE,
      mobileTiles: ["tasks", "habits", "ask"],
    };
    expect(currentOrder(prefs)).toEqual(BASE);
  });
});

describe("pins hold when a pending order is applied", () => {
  it("repin puts pinned places back at their current index", () => {
    const current: NavId[] = BASE.slice();
    const ranked: NavId[] = ["habits", ...BASE.filter((id) => id !== "habits")];
    const out = repin(ranked, current, ["today"]);
    expect(out[0]).toBe("today");
    expect(out[1]).toBe("habits");
    expect(new Set(out).size).toBe(BASE.length);
  });

  it("a pin made after the ranking ran still holds", () => {
    const pending = {
      order: ["habits", ...BASE.filter((id) => id !== "habits")],
      moved: "habits",
      at: NOW.toISOString(),
    };
    const prefs = { navOrderPending: pending, navPinned: ["today"] };
    expect(effectiveOrder(prefs)[0]).toBe("today");
    const patch = applyPendingPatch(prefs, "2026-11-15")!;
    expect((patch.navOrder as NavId[])[0]).toBe("today");
    expect((patch.navOrder as NavId[])[1]).toBe("habits");
  });
});

describe("the Free Mailbox rule moves Mailbox alone", () => {
  it("free and paid differ only in where Mailbox sits", () => {
    const order: NavId[] = ["mail", ...BASE.filter((id) => id !== "mail")];
    const free = withMailRule(order, [], true);
    const paid = withMailRule(order, [], false);
    expect(paid).toEqual(order);
    expect(free.indexOf("mail")).toBe(5);
    expect(free.filter((id) => id !== "mail")).toEqual(
      paid.filter((id) => id !== "mail")
    );
  });

  it("an unknown plan counts as paid", () => {
    const prefs = { navOrder: ["mail"] };
    expect(rankedPlaces(prefs)[0]).toBe("mail");
  });
});
