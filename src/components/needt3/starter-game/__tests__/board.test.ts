import {
  type SgTile,
  countTiles,
  createInput,
  createLabel,
  detailLabel,
  tileDetail,
  tileFromItem,
} from "../board";

const tile = (over: Partial<SgTile>): SgTile => ({
  id: "t",
  t: "Task",
  k: "task",
  s: "week",
  g: null,
  ...over,
});

describe("tileDetail", () => {
  it("says duration, cadence or horizon", () => {
    expect(tileDetail(tile({ min: 45 }))).toBe("45 min");
    expect(tileDetail(tile({ min: 90 }))).toBe("1 h 30");
    expect(tileDetail(tile({ k: "habit", perWeek: 7 }))).toBe("daily");
    expect(tileDetail(tile({ k: "habit", perWeek: 3 }))).toBe("3× a week");
    expect(tileDetail(tile({ k: "habit", perWeek: 1 }))).toBe("weekly");
    expect(tileDetail(tile({ k: "project", horizon: "until Dec" }))).toBe(
      "until Dec"
    );
    expect(tileDetail(tile({ k: "project" }))).toBe("ongoing");
  });

  it("names the editor's row by kind", () => {
    expect(detailLabel("task")).toBe("Duration");
    expect(detailLabel("habit")).toBe("How often");
    expect(detailLabel("project")).toBe("Until");
  });
});

describe("tileFromItem", () => {
  it("keeps what the agent said and starts unplaced", () => {
    expect(
      tileFromItem(
        {
          title: "Call Anna",
          kind: "task",
          suggestedGroup: "today",
          durationMinutes: 15,
          dueDay: "2026-10-20",
          firstStep: "Find her number",
        },
        "t1"
      )
    ).toEqual({
      id: "t1",
      t: "Call Anna",
      k: "task",
      s: "today",
      g: null,
      min: 15,
      perWeek: undefined,
      horizon: undefined,
      dueDay: "2026-10-20",
      firstStep: "Find her number",
    });
  });

  it("can start placed (an added suggestion)", () => {
    expect(
      tileFromItem(
        { title: "Read", kind: "habit", suggestedGroup: "habit" },
        "s1",
        "habit"
      ).g
    ).toBe("habit");
  });
});

describe("counts and the Create label", () => {
  const placed = [
    tile({ id: "1", g: "today" }),
    tile({ id: "2", g: "today" }),
    tile({ id: "3", g: "week" }),
    tile({ id: "4", k: "habit", g: "habit" }),
    tile({ id: "5", k: "project", g: "project" }),
    tile({ id: "6" }),
  ];

  it("counts tasks (today and this week), habits and projects", () => {
    expect(countTiles(placed)).toEqual({
      tasks: 3,
      today: 2,
      habits: 1,
      projects: 1,
    });
  });

  it("labels the button", () => {
    expect(createLabel(countTiles(placed))).toBe(
      "Create 3 tasks, 1 habit, 1 project"
    );
    expect(createLabel({ tasks: 1, today: 1, habits: 0, projects: 0 })).toBe(
      "Create 1 task"
    );
    expect(createLabel({ tasks: 0, today: 0, habits: 2, projects: 3 })).toBe(
      "Create 0 tasks, 2 habits, 3 projects"
    );
  });
});

describe("createInput", () => {
  it("lets the lane decide what a tile becomes", () => {
    const input = createInput([
      tile({ id: "1", t: "Call", g: "today", min: 15, dueDay: "2026-10-20" }),
      tile({ id: "2", t: "Plan", g: "week", min: 30 }),
      tile({
        id: "3",
        t: "Duolingo",
        k: "habit",
        g: "habit",
        perWeek: 7,
        min: 15,
      }),
      tile({
        id: "4",
        t: "German course",
        k: "project",
        g: "project",
        horizon: "until Dec",
        dueDay: "2026-12-01",
        firstStep: "Book the test",
      }),
      tile({ id: "5", t: "Left over" }),
    ]);
    expect(input).toEqual({
      tasks: [
        {
          title: "Call",
          group: "today",
          estimateMinutes: 15,
          dueDay: "2026-10-20",
        },
        { title: "Plan", group: "week", estimateMinutes: 30 },
      ],
      habits: [{ title: "Duolingo", perWeek: 7, estimateMinutes: 15 }],
      projects: [
        {
          name: "German course",
          firstStep: "Book the test",
          horizon: "until Dec",
          deadlineDay: "2026-12-01",
        },
      ],
    });
  });

  it("makes a gentle weekly habit of a tile that was not one", () => {
    const input = createInput([tile({ t: "Reply", g: "habit", min: 15 })]);
    expect(input.habits).toEqual([
      { title: "Reply", perWeek: 1, estimateMinutes: 15 },
    ]);
  });

  it("makes a project of a task with its first step, but not its date", () => {
    const input = createInput([
      tile({
        t: "Ship orders",
        g: "project",
        firstStep: "Print labels",
        dueDay: "2026-10-22",
        horizon: "ignored",
      }),
    ]);
    expect(input.projects).toEqual([
      { name: "Ship orders", firstStep: "Print labels" },
    ]);
  });

  it("is what the server accepts", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { starterCreateSchema } = require("@/lib/starter-game");
    const input = createInput([
      tile({ t: "Call", g: "today", min: 15 }),
      tile({ t: "Run", k: "habit", g: "habit", perWeek: 3 }),
      tile({ t: "Big", k: "project", g: "project", firstStep: "Start" }),
    ]);
    expect(starterCreateSchema.safeParse(input).success).toBe(true);
  });
});
