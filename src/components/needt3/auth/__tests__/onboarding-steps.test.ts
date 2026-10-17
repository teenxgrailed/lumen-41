import {
  DEFAULT_HOURS,
  SB_TILES,
  STEP_IDS,
  badHours,
  canDrop,
  clampStep,
  goTo,
  hhmm,
  startOrder,
  startZone,
  stepIndex,
  stepsFor,
  swapEffect,
  swapSay,
  swapTiles,
  toggleUse,
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
  it("are three, with an optional import", () => {
    expect(STEP_IDS).toEqual(["use", "calendar", "hours", "import"]);
    expect(stepsFor(false)).toEqual(["use", "calendar", "hours"]);
    expect(stepsFor(true)).toEqual(STEP_IDS);
  });
  it("clamps into range", () => {
    expect(clampStep(-3)).toBe(0);
    expect(clampStep(99, 3)).toBe(2);
    expect(clampStep(Number.NaN)).toBe(0);
    expect(stepIndex("hours")).toBe(2);
    expect(stepIndex("import", stepsFor(false))).toBe(-1);
  });
});

describe("hours", () => {
  it("need an hour between start and end", () => {
    expect(badHours(9, 18)).toBe(false);
    expect(badHours(9, 9)).toBe(true);
    expect(badHours(18, 9)).toBe(true);
    expect(hhmm(7)).toBe("07:00");
  });
  it("default to the server's 9-17", () => {
    expect(DEFAULT_HOURS).toEqual({ start: 9, end: 17 });
  });
});

describe("moving between steps", () => {
  it("stays inside the steps that are shown", () => {
    expect(goTo({ from: 0, to: 1, count: 3 })).toBe(1);
    expect(goTo({ from: 2, to: 3, count: 3 })).toBe(2);
    expect(goTo({ from: 1, to: -1, count: 3 })).toBe(0);
  });
});

describe("the uses", () => {
  it("keep the order they were picked in: the first one drives the sample", () => {
    let l: string[] = [];
    for (const u of ["study", "work", "side"]) l = toggleUse(l, u);
    expect(l).toEqual(["study", "work", "side"]);
    expect(toggleUse(l, "study")).toEqual(["work", "side"]);
    expect(toggleUse(toggleUse(l, "study"), "study")).toEqual([
      "work",
      "side",
      "study",
    ]);
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
