import {
  BLUE,
  MAP_BUDGET,
  type MapInput,
  STATUS_HUE,
  buildMapScene,
  mapStats,
  nodeLabel,
  sceneSize,
  statsLine,
  worstStatus,
} from "../map-scene";

const NOW = Date.UTC(2026, 10, 5, 12);
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const input: MapInput = {
  now: NOW,
  sources: [
    { id: "g", label: "Google Calendar", kind: "calendar" },
    { id: "m", label: "Gmail", kind: "mail" },
  ],
  agents: [
    { id: "a1", name: "Claude", status: "working", seen: true },
    { id: "a2", name: "Grok", status: "waiting", seen: true },
    { id: "a3", name: "Codex", status: "ok", seen: false },
  ],
  items: [
    {
      id: "i1",
      title: "Draft launch post",
      status: "done",
      assigneeId: "a1",
      related: ["i2"],
      updatedAt: day(1),
      createdAt: day(2),
      result: "Posted the draft to the hub",
    },
    {
      id: "i2",
      title: "Collect screenshots",
      status: "in_progress",
      assigneeId: "a2",
      related: [],
      updatedAt: day(0),
      createdAt: day(3),
      result: null,
      criteria: { met: 3, all: 4 },
    },
    {
      id: "i3",
      title: "Old cleanup",
      status: "done",
      assigneeId: null,
      related: [],
      updatedAt: day(20),
      createdAt: day(30),
      result: null,
    },
  ],
  threads: [
    {
      id: "t1",
      subject: "Launch copy",
      itemId: "i1",
      lastMessageAt: day(1),
    },
    {
      id: "t2",
      subject: "Old thread",
      itemId: null,
      lastMessageAt: day(12),
    },
  ],
};

describe("buildMapScene", () => {
  it("draws the same scene for the same seed", () => {
    const a = buildMapScene(input, 42, 1440, 900);
    const b = buildMapScene(input, 42, 1440, 900);
    expect(b).toEqual(a);
  });

  it("draws a different shape for another seed, with the same counts", () => {
    const a = buildMapScene(input, 1, 1440, 900);
    const b = buildMapScene(input, 2, 1440, 900);
    expect(b.nodes.map((n) => n.x)).not.toEqual(a.nodes.map((n) => n.x));
    expect(b.streams.map((s) => s.c1y)).not.toEqual(
      a.streams.map((s) => s.c1y)
    );
    expect(b.stats).toEqual(a.stats);
    expect(b.nodes.filter((n) => n.real).length).toBe(
      a.nodes.filter((n) => n.real).length
    );
  });

  it("keeps the real numbers exact; decoration never counts or speaks", () => {
    const scene = buildMapScene(input, 7, 1440, 900);
    expect(scene.stats).toEqual({
      agents: 3,
      tasksThisWeek: 2,
      messagesThisWeek: 1,
      workingNow: 1,
      waiting: 1,
    });
    expect(scene.nodes.filter((n) => n.kind === "agent")).toHaveLength(3);
    expect(scene.nodes.filter((n) => n.kind === "item")).toHaveLength(3);
    expect(scene.nodes.filter((n) => n.kind === "thread")).toHaveLength(2);
    expect(scene.nodes.filter((n) => n.real)).toHaveLength(8);
    expect(
      scene.nodes.filter((n) => !n.real).every((n) => n.label === null)
    ).toBe(true);
    expect(statsLine(scene.stats)).toBe(
      "3 agents · 2 tasks this week · 1 working now"
    );
  });

  it("links real items to their agent, to each other and to their threads", () => {
    const scene = buildMapScene(input, 9, 1440, 900);
    const idx = (kind: string, id: string) =>
      scene.nodes.findIndex((n) => n.kind === kind && n.id === id);
    const has = (a: number, b: number) =>
      scene.edges.some(
        (e) => (e.a === a && e.b === b) || (e.a === b && e.b === a)
      );
    expect(has(idx("agent", "a1"), idx("item", "i1"))).toBe(true);
    expect(has(idx("item", "i1"), idx("item", "i2"))).toBe(true);
    expect(has(idx("item", "i1"), idx("thread", "t1"))).toBe(true);
  });

  it("fills a new account with decoration and Needt's own sources", () => {
    const empty = buildMapScene(
      { now: NOW, sources: [], agents: [], items: [], threads: [] },
      3,
      1440,
      900
    );
    expect(empty.nodes.length).toBeGreaterThanOrEqual(150);
    expect(empty.nodes.every((n) => !n.real)).toBe(true);
    expect(empty.sources.map((s) => s.label)).toEqual([
      "Calendar",
      "Tasks",
      "Documents",
      "Habits",
    ]);
    expect(empty.streams.length).toBeGreaterThan(0);
    expect(empty.results).toHaveLength(0);
  });

  it("carries each agent's status, and picks the worst of several", () => {
    const scene = buildMapScene(input, 5, 1440, 900);
    const agent = (id: string) =>
      scene.nodes.find((n) => n.kind === "agent" && n.id === id)!;
    expect(agent("a1").status).toBe("working");
    expect(agent("a2").status).toBe("waiting");
    expect(agent("a3").status).toBe("ok");
    expect(worstStatus(["ok", "working", "waiting"])).toBe("waiting");
    expect(worstStatus(["working", "alert"])).toBe("alert");
    expect(worstStatus([])).toBe("ok");
    // Status colours are marks for agents; the ambient is the one blue.
    expect(STATUS_HUE.working).toEqual(BLUE);
  });

  it("hides the owner's words in presentation mode, keeps agent names", () => {
    const scene = buildMapScene(input, 5, 1440, 900);
    const item = scene.nodes.find((n) => n.kind === "item")!;
    const thread = scene.nodes.find((n) => n.kind === "thread")!;
    const agent = scene.nodes.find((n) => n.kind === "agent")!;
    expect(nodeLabel(item, false)).toBe(item.label);
    expect(nodeLabel(item, true)).toBe("Task");
    expect(nodeLabel(thread, true)).toBe("Review");
    expect(nodeLabel(agent, true)).toBe(agent.label);
  });

  it("pills show real work only: finished, or in progress with a checklist", () => {
    const scene = buildMapScene(input, 11, 1440, 900);
    expect(scene.results.map((r) => r.id)).toEqual(["i2", "i1", "i3"]);
    const [progress, done] = scene.results;
    expect(progress.progress).toBe(0.75);
    expect(progress.status).toBe("waiting");
    expect(done.progress).toBe(1);
    expect(done.title).toBe("Posted the draft to the hub");
    expect(done.by).toBe("Claude");
    // Pills sit on the right, inside the canvas.
    for (const r of scene.results) {
      expect(r.x + r.w).toBeLessThanOrEqual(1440);
      expect(r.x).toBeGreaterThan(1440 / 2);
    }
  });

  it("stays inside the element budget with a large account", () => {
    const big: MapInput = {
      now: NOW,
      sources: input.sources,
      agents: Array.from({ length: 40 }, (_, i) => ({
        id: `a${i}`,
        name: `A${i}`,
        status: "ok" as const,
        seen: false,
      })),
      items: Array.from({ length: 900 }, (_, i) => ({
        id: `i${i}`,
        title: `Item ${i}`,
        status: "open",
        assigneeId: `a${i % 40}`,
        related: [`i${(i + 1) % 900}`],
        updatedAt: day(i % 5),
        result: null,
      })),
      threads: Array.from({ length: 300 }, (_, i) => ({
        id: `t${i}`,
        subject: `Thread ${i}`,
        itemId: `i${i}`,
        lastMessageAt: day(i % 14),
      })),
    };
    const scene = buildMapScene(big, 13, 1440, 900);
    expect(sceneSize(scene)).toBeLessThanOrEqual(MAP_BUDGET);
    // The pill still says the true totals, not the drawn ones.
    expect(mapStats(big).agents).toBe(40);
    expect(scene.stats.tasksThisWeek).toBe(900);
  });

  it("stands on end on a phone: sources on top, two pills at the bottom", () => {
    const scene = buildMapScene(input, 4, 390, 760);
    expect(scene.phone).toBe(true);
    expect(scene.streams.every((s) => s.y0 < 100)).toBe(true);
    expect(scene.sources.every((s) => s.y < 100)).toBe(true);
    expect(scene.results).toHaveLength(2);
    expect(scene.results.every((r) => r.y > 760 / 2)).toBe(true);
    expect(sceneSize(scene)).toBeLessThanOrEqual(MAP_BUDGET);
  });
});
