import {
  DEFAULT_MENU_TILES,
  MENU_TILE_IDS,
  type MenuTile,
  addableTiles,
  layoutFromRow,
  moveTile,
  tileKey,
} from "@/lib/phone-menu/layout";

import {
  type TileBox,
  type TileFacts,
  dayEvents,
  dragTo,
  dropIndex,
  mailRows,
  packTiles,
  placesOnGrid,
  planEmptyText,
  reflow,
  removed,
  resized,
  tileName,
  tileView,
  todayRows,
  weekDots,
} from "../model";

const facts = (over: Partial<TileFacts> = {}): TileFacts => ({
  counts: {},
  focus: null,
  projects: new Map(),
  ...over,
});
const tile = (id: MenuTile["id"], extra: Partial<MenuTile> = {}): MenuTile => ({
  id,
  size: "1x1",
  ...extra,
});

describe("the catalogue and the default set", () => {
  it("starts with Today, Focus, Calendar and Habits at 1x1", () => {
    expect(DEFAULT_MENU_TILES.map((t) => t.id)).toEqual([
      "today",
      "focus",
      "calendar",
      "habits",
    ]);
    expect(DEFAULT_MENU_TILES.every((t) => t.size === "1x1")).toBe(true);
  });

  it("holds the ten owner-approved tiles", () => {
    expect([...MENU_TILE_IDS].sort()).toEqual(
      [
        "ask",
        "calendar",
        "docs",
        "focus",
        "habits",
        "inbox",
        "mail",
        "project",
        "streak",
        "today",
      ].sort()
    );
  });

  it("every catalogue entry has a name and a view", () => {
    for (const id of MENU_TILE_IDS) {
      expect(tileName(id)).toBeTruthy();
      const v = tileView(
        tile(id, id === "project" ? { projectId: "p" } : {}),
        facts()
      );
      expect(v.word).toBeTruthy();
      expect(v.word).not.toBe(v.label); // the category is never the title
      expect(v.go).toBeTruthy();
    }
  });
});

describe("layoutFromRow", () => {
  it("is the default set and the tiles style with no row", () => {
    expect(layoutFromRow(null)).toEqual({
      style: "tiles",
      tiles: DEFAULT_MENU_TILES,
    });
  });
  it("keeps a stored empty list: removing everything is a choice", () => {
    expect(layoutFromRow({ style: "tiles", tiles: [] }).tiles).toEqual([]);
  });
  it("falls back to the default for a list that no longer validates", () => {
    expect(layoutFromRow({ style: "card", tiles: "nope" })).toEqual({
      style: "card",
      tiles: DEFAULT_MENU_TILES,
    });
  });
  it("reads anything but card as tiles", () => {
    expect(layoutFromRow({ style: "wat", tiles: [] }).style).toBe("tiles");
  });
});

describe("planEmptyText", () => {
  it("does not say 'Nothing planned' while work is overdue", () => {
    expect(planEmptyText({ overdue: 19 })).toBe("Nothing due today");
    expect(planEmptyText({ overdue: 1 })).toBe("Nothing due today");
  });
  it("says it plainly on a clear day", () => {
    expect(planEmptyText({ overdue: 0 })).toBe("Nothing planned");
    expect(planEmptyText({})).toBe("Nothing planned");
  });
});

describe("tileView", () => {
  it("Today says what is left and alerts on overdue", () => {
    const v = tileView(
      tile("today"),
      facts({ counts: { overdue: 2, today: 3 } })
    );
    expect(v.word).toBe("Today");
    expect(v.sub).toBe("2 overdue");
    expect(v.alert).toBe(true);
    expect(v.label).toBe("Plan");
    expect(tileView(tile("today"), facts({ counts: { today: 3 } })).sub).toBe(
      "3 tasks left"
    );
    expect(v.go).toEqual({ kind: "place", id: "home" });
  });

  it("Focus shows the clock while a session runs, and opens the Focus sheet", () => {
    const idle = tileView(tile("focus"), facts());
    expect(idle.sub).toBe("Tap to start");
    expect(idle.label).toBe("Focus \u00b7 Timer");
    expect(idle.go).toEqual({ kind: "focus" });
    const live = tileView(
      tile("focus"),
      facts({ focus: { label: "18 min", pct: 0.4, paused: false } })
    );
    expect(live.word).toBe("18 min");
    expect(live.sub).toBe("Time left");
  });

  it("Calendar says the next event, or that the day is free, or waits", () => {
    expect(
      tileView(
        tile("calendar"),
        facts({
          counts: { nextEvent: { title: "Standup", at: "09:30", inMin: 5 } },
        })
      ).word
    ).toBe("09:30");
    expect(
      tileView(tile("calendar"), facts({ counts: { nextEvent: null } })).word
    ).toBe("Free");
    expect(tileView(tile("calendar"), facts()).quiet).toBe(true);
  });

  it("Habits, Inbox, Mail and Docs read the shared counts", () => {
    const c = {
      habits: 4,
      habitsDone: 1,
      unplaced: 3,
      mail: 7,
      docs: 12,
      docsEdited: "5 min ago",
    };
    expect(tileView(tile("habits"), facts({ counts: c })).word).toBe("1 of 4");
    expect(tileView(tile("inbox"), facts({ counts: c })).word).toBe("3");
    expect(tileView(tile("inbox"), facts({ counts: c })).go).toEqual({
      kind: "place",
      id: "tasks",
    });
    expect(tileView(tile("mail"), facts({ counts: c })).word).toBe("7");
    expect(tileView(tile("docs"), facts({ counts: c })).word).toBe("12 pages");
    expect(tileView(tile("docs"), facts({ counts: c })).sub).toBe(
      "edited 5 min ago"
    );
  });

  it("Streak and a project folder use their own facts; a habit's colour is the habits tile's", () => {
    expect(tileView(tile("streak"), facts({ streak: 1 })).word).toBe("1 day");
    expect(tileView(tile("streak"), facts({ streak: 9 })).word).toBe("9 days");
    const projects = new Map([
      ["p1", { name: "Resale", hue: "#c05", open: 4 }],
    ]);
    const p = tileView(
      tile("project", { projectId: "p1" }),
      facts({ projects })
    );
    expect(p.word).toBe("Resale");
    expect(p.sub).toBe("4 open");
    expect(p.hue).toBe("#c05");
    expect(p.go).toEqual({ kind: "project", id: "p1" });
    expect(tileView(tile("habits"), facts({ habitHue: "#7a5" })).hue).toBe(
      "#7a5"
    );
  });

  it("a tile's hue is the object's own and never the accent", () => {
    for (const id of MENU_TILE_IDS)
      expect(
        tileView(tile(id, id === "project" ? { projectId: "p" } : {}), facts())
          .hue ?? ""
      ).not.toMatch(/accent/);
  });
});

describe("the editor's arithmetic", () => {
  const three = [tile("today"), tile("focus"), tile("habits")];

  it("moves, resizes and removes without touching the input", () => {
    const before = JSON.stringify(three);
    expect(moveTile(three, 0, 2).map((t) => t.id)).toEqual([
      "focus",
      "habits",
      "today",
    ]);
    expect(moveTile(three, 0, 9)).toEqual(three);
    expect(resized(three, "focus")[1].size).toBe("2x1");
    expect(resized(resized(three, "focus"), "focus")[1].size).toBe("1x1");
    expect(removed(three, "focus").map((t) => t.id)).toEqual([
      "today",
      "habits",
    ]);
    expect(dragTo(three, "habits", 0).map((t) => t.id)).toEqual([
      "habits",
      "today",
      "focus",
    ]);
    expect(dragTo(three, "ghost", 0)).toEqual(three);
    expect(JSON.stringify(three)).toBe(before);
  });

  it("two project folders have different keys", () => {
    expect(tileKey(tile("project", { projectId: "a" }))).not.toBe(
      tileKey(tile("project", { projectId: "b" }))
    );
  });

  it("offers a project again but a tile already on the grid not at all", () => {
    const free = addableTiles([
      tile("today"),
      tile("project", { projectId: "a" }),
    ]);
    expect(free).not.toContain("today");
    expect(free).toContain("project");
    expect(free).toContain("streak");
  });

  it("dropIndex: the box under the finger, else the nearest centre", () => {
    const boxes: TileBox[] = [
      { key: "a", x: 0, y: 0, w: 100, h: 100 },
      { key: "b", x: 112, y: 0, w: 100, h: 100 },
      { key: "c", x: 0, y: 112, w: 212, h: 100 },
    ];
    expect(dropIndex(boxes, 150, 40)).toBe(1);
    expect(dropIndex(boxes, 50, 150)).toBe(2);
    expect(dropIndex(boxes, 106, 50)).toBe(0); // in the gap, nearer a
    expect(dropIndex(boxes, 400, 400)).toBe(2);
    expect(dropIndex([], 1, 1)).toBe(-1);
  });

  it("the places a tile stands for leave the All places list", () => {
    const on = placesOnGrid([tile("today"), tile("inbox"), tile("focus")]);
    expect(on.has("home")).toBe(true);
    expect(on.has("tasks")).toBe(true);
    expect(on.has("mail")).toBe(false);
  });
});

describe("one name per tile", () => {
  it("every tile has a name, and a project folder carries the project's", () => {
    for (const id of MENU_TILE_IDS)
      expect(tileView(tile(id), facts()).name).toBe(tileName(id));
    const projects = new Map([["p1", { name: "Resale", hue: null, open: 1 }]]);
    expect(
      tileView(tile("project", { projectId: "p1" }), facts({ projects })).name
    ).toBe("Resale");
  });
});

describe("reading the app's data into tiles", () => {
  const t = (over: object) => ({
    title: "T",
    done: false,
    noSlot: false,
    dueDate: null,
    scheduledStart: null,
    ...over,
  });

  it("todayRows: placed tasks by their start, then the ones only due today; done ones never", () => {
    const rows = todayRows(
      [
        t({ title: "B", scheduledStart: "2026-11-20T10:30" }),
        t({ title: "A", scheduledStart: "2026-11-20T09:00" }),
        t({ title: "Due", dueDate: "2026-11-20" }),
        t({ title: "Done", dueDate: "2026-11-20", done: true }),
        t({ title: "Later", scheduledStart: "2026-11-21T09:00" }),
      ],
      "2026-11-20"
    );
    expect(rows).toEqual([
      { time: "09:00", title: "A" },
      { time: "10:30", title: "B" },
      { time: null, title: "Due" },
    ]);
  });

  it("dayEvents: timed events of today that have not ended, soonest first, in minutes", () => {
    const e = (
      title: string,
      startAt: string,
      endAt: string,
      isAllDay = false
    ) => ({
      title,
      startAt,
      endAt,
      isAllDay,
    });
    const ev = dayEvents(
      [
        e("Late", "2026-11-20T16:00", "2026-11-20T17:00"),
        e("Over", "2026-11-20T08:00", "2026-11-20T09:00"),
        e("Day", "2026-11-20T00:00", "2026-11-21T00:00", true),
        e("Next", "2026-11-20T12:15", "2026-11-20T13:00"),
      ],
      "2026-11-20T11:00"
    );
    expect(ev.map((x) => x.title)).toEqual(["Next", "Late"]);
    expect(ev[0]).toMatchObject({ at: "12:15", start: 735, end: 780 });
  });

  it("weekDots: seven days ending today, closed when everything due was done", () => {
    const dots = weekDots(
      [
        { dueDate: "2026-11-20", done: true },
        { dueDate: "2026-11-19", done: true },
        { dueDate: "2026-11-19", done: false },
        { dueDate: "2026-11-18", done: true },
      ],
      "2026-11-20"
    );
    expect(dots).toHaveLength(7);
    expect(dots.slice(-3)).toEqual(["closed", "open", "closed"]);
    expect(dots[0]).toBe("quiet");
  });

  it("mailRows: unread first, then the newest read; never archived", () => {
    const m = (over: object) => ({
      from: "x",
      subject: "s",
      preview: "p",
      isRead: true,
      isArchived: false,
      trashedAt: null,
      receivedAt: "2026-11-20T08:00",
      ...over,
    });
    const rows = mailRows([
      m({ from: "Old read", receivedAt: "2026-11-19T08:00" }),
      m({ from: "New read", receivedAt: "2026-11-20T09:00" }),
      m({ from: "Unread", isRead: false, receivedAt: "2026-11-18T08:00" }),
      m({ from: "Gone", isArchived: true }),
    ]);
    expect(rows.map((r) => r.from)).toEqual(["Unread", "New read", "Old read"]);
  });
});

describe("the live reflow of a drag", () => {
  const set = [
    tile("today"),
    tile("focus"),
    tile("ask", { size: "2x1" }),
    tile("habits"),
    tile("mail"),
  ];

  it("packTiles lays tiles out in order, two columns, a wide one on its own row", () => {
    expect(packTiles(set)).toEqual([
      { col: 0, row: 0, span: 1 },
      { col: 1, row: 0, span: 1 },
      { col: 0, row: 1, span: 2 },
      { col: 0, row: 2, span: 1 },
      { col: 1, row: 2, span: 1 },
    ]);
  });

  it("a wide tile that does not fit beside a half tile starts the next row (no back-filling)", () => {
    expect(
      packTiles([tile("today"), tile("ask", { size: "2x1" }), tile("focus")])
    ).toEqual([
      { col: 0, row: 0, span: 1 },
      { col: 0, row: 1, span: 2 },
      { col: 0, row: 2, span: 1 },
    ]);
  });

  it("reflow to where it already is moves nothing", () => {
    for (const d of reflow(set, "focus", 1).values())
      expect(d).toEqual({ dc: 0, dr: 0 });
  });

  it("reflow: dragging the first tile to the end shifts every other tile to the place before", () => {
    const r = reflow(set, "today", 4);
    const after = packTiles(dragTo(set, "today", 4));
    const before = packTiles(set);
    set.forEach((x, i) => {
      const j = dragTo(set, "today", 4).findIndex((n) => n.id === x.id);
      expect(r.get(x.id)).toEqual({
        dc: after[j].col - before[i].col,
        dr: after[j].row - before[i].row,
      });
    });
    expect(r.get("today")).toEqual({ dc: 0, dr: 3 });
  });
});
