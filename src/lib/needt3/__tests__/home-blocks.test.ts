import {
  DEFAULT_HOME_BLOCKS,
  HOME_BLOCKS_PREF,
  homeBlocksError,
  homeBlocksOf,
  moveRailTile,
  readHomeBlocks,
  shownRailTiles,
} from "../home-blocks";

describe("readHomeBlocks", () => {
  it("shows everything, in the default order, when nothing is stored", () => {
    expect(readHomeBlocks(undefined)).toEqual(DEFAULT_HOME_BLOCKS);
    expect(readHomeBlocks("x")).toEqual(DEFAULT_HOME_BLOCKS);
    expect(homeBlocksOf({})).toEqual(DEFAULT_HOME_BLOCKS);
  });

  it("keeps a stored flag and falls back on a malformed one", () => {
    const b = readHomeBlocks({ habits: false, inbox: "no", nextUp: false });
    expect(b.habits).toBe(false);
    expect(b.nextUp).toBe(false);
    expect(b.inbox).toBe(true);
  });

  it("repairs the order: unknown and repeated dropped, missing appended", () => {
    const b = readHomeBlocks({ order: ["inbox", "x", "inbox", "habits"] });
    expect(b.order).toEqual([
      "inbox",
      "habits",
      "todayBar",
      "week",
      "schedule",
    ]);
  });

  it("lists the rail's shown tiles in the person's order", () => {
    const b = readHomeBlocks({
      order: ["inbox", "habits"],
      habits: false,
      week: false,
    });
    expect(shownRailTiles(b)).toEqual(["inbox", "todayBar", "schedule"]);
    const none = readHomeBlocks({
      todayBar: false,
      habits: false,
      week: false,
      schedule: false,
      inbox: false,
    });
    expect(shownRailTiles(none)).toEqual([]);
  });
});

describe("moveRailTile", () => {
  const order = DEFAULT_HOME_BLOCKS.order;
  it("swaps with the neighbour and stops at the ends", () => {
    expect(moveRailTile(order, "habits", -1)[0]).toBe("habits");
    expect(moveRailTile(order, "habits", 1)[2]).toBe("habits");
    expect(moveRailTile(order, "todayBar", -1)).toEqual(order);
    expect(moveRailTile(order, "inbox", 1)).toEqual(order);
  });
});

describe("homeBlocksError", () => {
  it("accepts a valid setting and a partial one", () => {
    expect(homeBlocksError({})).toBeUndefined();
    expect(
      homeBlocksError({ habits: false, order: ["inbox", "week"] })
    ).toBeUndefined();
  });
  it("rejects bad shapes with a message", () => {
    expect(homeBlocksError([])).toMatch(/object/);
    expect(homeBlocksError({ habits: "no" })).toMatch(/habits/);
    expect(homeBlocksError({ order: ["x"] })).toMatch(/order/);
    expect(homeBlocksError({ order: ["inbox", "inbox"] })).toMatch(/repeat/);
    expect(homeBlocksError({ sidebar: true })).toMatch(/not an option/);
  });
  it("uses prefs.homeBlocks as its key", () => {
    expect(HOME_BLOCKS_PREF).toBe("homeBlocks");
  });
});
