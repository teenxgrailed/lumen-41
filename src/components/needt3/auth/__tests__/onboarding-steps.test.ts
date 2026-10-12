import {
  DEFAULT_HOURS,
  SB_TILES,
  STEP_IDS,
  badHours,
  canDrop,
  clampStep,
  goTo,
  hhmm,
  hoursPatch,
  startOrder,
  startZone,
  stepIndex,
  stepsToSave,
  swapEffect,
  swapSay,
  swapTiles,
  zoneChoices,
} from "../onboarding-steps";

const ALL = [
  "today",
  "calendar",
  "tasks",
  "docs",
  "mail",
  "projects",
  "moodboards",
  "habits",
];

describe("steps", () => {
  it("are five, with no view step", () => {
    expect(STEP_IDS).toEqual(["use", "setup", "sidebar", "first", "placed"]);
    expect(STEP_IDS).not.toContain("view");
  });
  it("clamps into range", () => {
    expect(clampStep(-3)).toBe(0);
    expect(clampStep(99)).toBe(4);
    expect(clampStep(Number.NaN)).toBe(0);
    expect(stepIndex("first")).toBe(3);
  });
});

describe("hours", () => {
  it("need an hour between start and end", () => {
    expect(badHours(9, 18)).toBe(false);
    expect(badHours(9, 9)).toBe(true);
    expect(badHours(18, 9)).toBe(true);
    expect(hhmm(7)).toBe("07:00");
  });
});

describe("moving between steps", () => {
  const base = { from: 1, start: 9, end: 18, hasFirst: false };
  it("refuses to leave setup forward with impossible hours", () => {
    expect(goTo({ ...base, to: 2, start: 18, end: 9 })).toBeNull();
    expect(goTo({ ...base, to: 0, start: 18, end: 9 })).toBe(0);
  });
  it("shows where it went only once a task exists", () => {
    expect(goTo({ ...base, from: 3, to: 4 })).toBeNull();
    expect(goTo({ ...base, from: 3, to: 4, hasFirst: true })).toBe(4);
  });
  it("moves freely otherwise", () => {
    expect(goTo({ ...base, from: 0, to: 1 })).toBe(1);
  });
});

describe("sidebar swap", () => {
  it("trades two places and leaves the rest", () => {
    expect(swapTiles(ALL, "today", "mail")).toEqual([
      "mail",
      "calendar",
      "tasks",
      "docs",
      "today",
      "projects",
      "moodboards",
      "habits",
    ]);
    expect(swapTiles(ALL, "today", "today")).toEqual(ALL);
    expect(swapTiles(ALL, "today", "nope")).toEqual(ALL);
  });
  it("does not mutate its input", () => {
    const copy = ALL.slice();
    swapTiles(ALL, "today", "habits");
    expect(ALL).toEqual(copy);
  });
  it("sends the replaced tile back to More", () => {
    const e = swapEffect(ALL, "habits", "docs");
    expect(e.into).toBe("habits");
    expect(e.back).toBe("docs");
  });
  it("a swap inside the grid sends nothing out", () => {
    const e = swapEffect(ALL, "today", "tasks");
    expect(e.into).toBeNull();
    expect(e.back).toBeNull();
  });
  it("only a tile accepts a drop from the sea", () => {
    expect(canDrop(ALL, "habits", "docs")).toBe(true);
    expect(canDrop(ALL, "habits", "moodboards")).toBe(false);
    expect(canDrop(ALL, "today", "tasks")).toBe(true);
    expect(canDrop(ALL, "today", "today")).toBe(false);
    expect(canDrop(ALL, "today", "nope")).toBe(false);
  });
  it("five tiles then More", () => {
    expect(SB_TILES).toBe(5);
  });
  it("says what happened", () => {
    const name = (id: string) => id.toUpperCase();
    expect(swapSay(name, ALL, "habits", "docs")).toBe(
      "HABITS is a tile now; DOCS moved to More."
    );
    expect(swapSay(name, ALL, "today", "tasks")).toBe(
      "TODAY and TASKS swapped places."
    );
  });
});

describe("the saved tile list", () => {
  it("falls back to every place in order", () => {
    expect(startOrder(ALL, null)).toEqual(ALL);
  });
  it("keeps the saved order, drops strangers and repeats, appends new places", () => {
    expect(startOrder(ALL, ["mail", "x", "mail", "today"])).toEqual([
      "mail",
      "today",
      "calendar",
      "tasks",
      "docs",
      "projects",
      "moodboards",
      "habits",
    ]);
  });
});

describe("working hours save rule", () => {
  const base = { loaded: true, start: 9, end: 17, savedStart: 9, savedEnd: 17 };

  it("defaults to the server's 9–17", () => {
    expect(DEFAULT_HOURS).toEqual({ start: 9, end: 17 });
  });

  it("writes nothing before the saved hours have loaded", () => {
    expect(hoursPatch({ ...base, loaded: false, end: 18 })).toBeNull();
  });

  it("writes nothing when the hours did not change", () => {
    expect(hoursPatch(base)).toBeNull();
  });

  it("writes changed, valid hours", () => {
    expect(hoursPatch({ ...base, start: 8 })).toEqual({
      workHourStart: 8,
      workHourEnd: 17,
    });
  });

  it("never writes invalid hours", () => {
    expect(hoursPatch({ ...base, start: 17, end: 17 })).toBeNull();
  });
});

describe("steps saved on the way forward", () => {
  it("saves only steps the person stood on", () => {
    expect(stepsToSave(0, 3, new Set(["use"]))).toEqual(["use"]);
    expect(stepsToSave(0, 3, new Set(["use", "setup", "sidebar"]))).toEqual([
      "use",
      "setup",
      "sidebar",
    ]);
  });

  it("saves nothing going back", () => {
    expect(stepsToSave(3, 1, new Set(STEP_IDS))).toEqual([]);
  });
});

describe("time zone", () => {
  it("preselects the device zone for a new person on the default", () => {
    expect(startZone("UTC", "Europe/Kyiv", false)).toBe("Europe/Kyiv");
    expect(startZone("Etc/UTC", "Europe/Kyiv", false)).toBe("Europe/Kyiv");
  });

  it("keeps a chosen zone, and UTC once onboarded", () => {
    expect(startZone("Asia/Tokyo", "Europe/Kyiv", false)).toBe("Asia/Tokyo");
    expect(startZone("UTC", "Europe/Kyiv", true)).toBe("UTC");
  });

  it("always offers the device zone and the saved one", () => {
    const list = zoneChoices(
      ["UTC", "Europe/Berlin"],
      "Europe/Kyiv",
      "Asia/Tokyo"
    );
    expect(list).toEqual(["Europe/Kyiv", "Asia/Tokyo", "UTC", "Europe/Berlin"]);
    expect(zoneChoices(["UTC"], "UTC", "UTC")).toEqual(["UTC"]);
  });
});
