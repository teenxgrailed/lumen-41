import {
  type RoadmapTask,
  blockedByTitles,
  buildRoadmap,
  hubStatusLabel,
  waitingLine,
} from "../roadmap";

let n = 0;
function task(over: Partial<RoadmapTask> & { id: string }): RoadmapTask {
  n += 1;
  return {
    title: over.id,
    done: false,
    status: "todo",
    projectId: "p",
    blockedBy: null,
    notes: null,
    createdAt: `2026-11-01T00:00:${String(n).padStart(2, "0")}Z`,
    dueDate: null,
    deadline: null,
    ...over,
  };
}

describe("blockedByTitles", () => {
  it("reads every blocked-by line, split on commas", () => {
    expect(
      blockedByTitles(
        "Some text\nblocked by: Billing, Onboarding\nBlocked By: QA"
      )
    ).toEqual(["Billing", "Onboarding", "QA"]);
  });
  it("is empty without notes", () => {
    expect(blockedByTitles(null)).toEqual([]);
    expect(blockedByTitles("nothing here")).toEqual([]);
  });
});

describe("buildRoadmap", () => {
  it("computes done / current / next / blocked like the plan skill", () => {
    const tasks = [
      task({ id: "auth", done: true, status: "completed" }),
      task({ id: "billing", blockedBy: "auth", status: "in_progress" }),
      task({ id: "onboarding", blockedBy: "auth" }),
      task({ id: "launch", blockedBy: "billing" }),
    ];
    const map = buildRoadmap("p", tasks);
    const st = Object.fromEntries(map.stations.map((s) => [s.id, s.state]));
    expect(st).toEqual({
      auth: "done",
      billing: "current",
      onboarding: "next",
      launch: "blocked",
    });
    expect(map.current?.id).toBe("billing");
    expect(map.upNext?.id).toBe("onboarding");
  });

  it("keeps one current: later in_progress tasks read as next", () => {
    const map = buildRoadmap("p", [
      task({ id: "a", status: "in_progress" }),
      task({ id: "b", status: "in_progress" }),
    ]);
    expect(map.stations.map((s) => s.state)).toEqual(["current", "next"]);
  });

  it("blocked wins over in_progress", () => {
    const map = buildRoadmap("p", [
      task({ id: "a" }),
      task({ id: "b", blockedBy: "a", status: "in_progress" }),
    ]);
    expect(map.stations[1].state).toBe("blocked");
    expect(map.current).toBeNull();
  });

  it("puts a blocker before the task waiting on it, whatever the made order", () => {
    const map = buildRoadmap("p", [
      task({ id: "late", blockedBy: "early" }),
      task({ id: "early" }),
    ]);
    expect(map.stations.map((s) => s.id)).toEqual(["early", "late"]);
    expect(map.stations.map((s) => s.row)).toEqual([0, 1]);
  });

  it("reads further blockers from `blocked by:` in the notes and draws them as waits", () => {
    const map = buildRoadmap("p", [
      task({ id: "b1", title: "Billing" }),
      task({ id: "o1", title: "Onboarding", blockedBy: "b1" }),
      task({
        id: "l1",
        title: "Launch",
        blockedBy: "o1",
        notes: "blocked by: billing",
      }),
    ]);
    const launch = map.stations.find((s) => s.id === "l1")!;
    expect(launch.waitsOn.map((b) => b.id)).toEqual(["o1", "b1"]);
    expect(launch.state).toBe("blocked");
    expect(waitingLine(launch)).toBe("Waiting on Onboarding and Billing");
    expect(map.edges).toContainEqual({
      from: "b1",
      to: "l1",
      kind: "wait",
      travelled: false,
    });
  });

  it("forks a lane when two tasks wait on the same one", () => {
    const map = buildRoadmap("p", [
      task({ id: "a", done: true, status: "completed" }),
      task({ id: "b", blockedBy: "a" }),
      task({ id: "c", blockedBy: "a" }),
      task({ id: "d", blockedBy: "c" }),
    ]);
    const lane = Object.fromEntries(map.stations.map((s) => [s.id, s.lane]));
    expect(lane).toEqual({ a: 0, b: 0, c: 1, d: 1 });
    expect(map.lanes).toBe(2);
    expect(map.edges.filter((e) => e.kind === "line")).toEqual([
      { from: "a", to: "b", kind: "line", travelled: true },
      { from: "a", to: "c", kind: "line", travelled: true },
      { from: "c", to: "d", kind: "line", travelled: false },
    ]);
  });

  it("keeps a plain list of tasks on one line, in the order they were made", () => {
    const map = buildRoadmap("p", [
      task({ id: "x" }),
      task({ id: "y" }),
      task({ id: "z" }),
    ]);
    expect(map.lanes).toBe(1);
    expect(map.stations.every((s) => s.lane === 0)).toBe(true);
    expect(map.edges.map((e) => `${e.from}>${e.to}:${e.kind}`)).toEqual([
      "x>y:seq",
      "y>z:seq",
    ]);
    expect(map.upNext?.id).toBe("x");
  });

  it("a blocker in another project still blocks, and is marked outside", () => {
    const map = buildRoadmap("p", [
      task({ id: "other", projectId: "q", title: "Contract signed" }),
      task({ id: "a", blockedBy: "other" }),
    ]);
    expect(map.stations).toHaveLength(1);
    expect(map.stations[0].state).toBe("blocked");
    expect(map.stations[0].waitsOn).toEqual([
      { id: "other", title: "Contract signed", done: false, outside: true },
    ]);
    expect(map.edges).toEqual([]);
  });

  it("leaves out repeating and binned tasks", () => {
    const map = buildRoadmap("p", [
      task({ id: "a" }),
      task({ id: "r", repeat: "FREQ=DAILY" }),
      task({ id: "t", trashedAt: "2026-11-02T00:00:00Z" }),
    ]);
    expect(map.stations.map((s) => s.id)).toEqual(["a"]);
  });

  it("survives a loop written in the notes", () => {
    const map = buildRoadmap("p", [
      task({ id: "a", title: "A", notes: "blocked by: B" }),
      task({ id: "b", title: "B", notes: "blocked by: A" }),
    ]);
    expect(map.stations).toHaveLength(2);
    expect(map.stations.every((s) => s.state === "blocked")).toBe(true);
  });

  it("counts steps and prefers the deadline as the date", () => {
    const map = buildRoadmap("p", [
      task({
        id: "a",
        dueDate: "2026-11-20",
        deadline: "2026-11-17",
        parts: [{ done: true }, { done: false }],
      }),
    ]);
    expect(map.stations[0].steps).toEqual({ done: 1, total: 2 });
    expect(map.stations[0].due).toBe("2026-11-17");
  });

  it("links hub items to their task, newest first", () => {
    const map = buildRoadmap(
      "p",
      [task({ id: "a" })],
      [
        {
          id: "h1",
          title: "old",
          status: "done",
          taskId: "a",
          agent: "Codex",
          updatedAt: "2026-11-01T00:00:00Z",
        },
        {
          id: "h2",
          title: "new",
          status: "in_progress",
          taskId: "a",
          agent: "Claude",
          updatedAt: "2026-11-02T00:00:00Z",
        },
        {
          id: "h3",
          title: "elsewhere",
          status: "open",
          taskId: "zz",
          agent: null,
        },
      ]
    );
    expect(map.stations[0].hub.map((h) => h.id)).toEqual(["h2", "h1"]);
    expect(hubStatusLabel("in_progress")).toBe("working");
    expect(hubStatusLabel("needs_owner")).toBe("needs you");
  });

  it("is empty for a project with no tasks", () => {
    const map = buildRoadmap("p", [task({ id: "a", projectId: "q" })]);
    expect(map.stations).toEqual([]);
    expect(map.current).toBeNull();
    expect(map.upNext).toBeNull();
  });
});

describe("buildRoadmap, review fixes", () => {
  it("matches a whole blocked-by line as one title with a comma, and titles in other projects", () => {
    const map = buildRoadmap("p", [
      task({ id: "pt", title: "Pricing, tiers" }),
      task({ id: "ext", title: "Contract signed", projectId: "q" }),
      task({
        id: "a",
        notes: "blocked by: Pricing, tiers\nblocked by: Contract signed",
      }),
    ]);
    const a = map.stations.find((s) => s.id === "a")!;
    expect(a.waitsOn.map((b) => [b.id, b.outside])).toEqual([
      ["pt", false],
      ["ext", true],
    ]);
    expect(a.state).toBe("blocked");
  });

  it("a second task in progress is marked, and is not the one proposed next", () => {
    const map = buildRoadmap("p", [
      task({ id: "a", status: "in_progress" }),
      task({ id: "b", status: "in_progress" }),
      task({ id: "c" }),
    ]);
    const b = map.stations[1];
    expect(b.state).toBe("next");
    expect(b.inProgress).toBe(true);
    expect(map.upNext?.id).toBe("c");
  });
});
