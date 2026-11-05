import {
  MAP_BUDGET,
  type MapInput,
  buildMapScene,
  mapStats,
  nodeLabel,
  sceneSize,
  statsLine,
} from "../map-scene";

const NOW = Date.UTC(2026, 10, 5, 12);
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const input: MapInput = {
  now: NOW,
  sources: [
    { id: "g", label: "work@example.com", kind: "calendar" },
    { id: "m", label: "Gmail", kind: "mail" },
  ],
  agents: [
    { id: "a1", name: "Claude", active: true, seen: true },
    { id: "a2", name: "Grok", active: false, seen: true },
    { id: "a3", name: "Codex", active: true, seen: false },
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
    { id: "t1", subject: "Launch copy", itemId: "i1", lastMessageAt: day(1) },
    { id: "t2", subject: "Old thread", itemId: null, lastMessageAt: day(12) },
  ],
};

describe("buildMapScene", () => {
  it("draws the same scene for the same seed", () => {
    const a = buildMapScene(input, 42, 1200, 800);
    const b = buildMapScene(input, 42, 1200, 800);
    expect(b).toEqual(a);
  });

  it("draws a different shape for another seed, with the same counts", () => {
    const a = buildMapScene(input, 1, 1200, 800);
    const b = buildMapScene(input, 2, 1200, 800);
    expect(b.nodes.map((n) => n.x)).not.toEqual(a.nodes.map((n) => n.x));
    expect(b.streams.map((s) => s.c1y)).not.toEqual(
      a.streams.map((s) => s.c1y)
    );
    expect(b.stats).toEqual(a.stats);
    expect(b.nodes.filter((n) => n.real).length).toBe(
      a.nodes.filter((n) => n.real).length
    );
  });

  it("keeps the real numbers exact; decoration never counts", () => {
    const scene = buildMapScene(input, 7, 1200, 800);
    expect(scene.stats).toEqual({
      agents: 3,
      tasksThisWeek: 2,
      messagesThisWeek: 1,
      workingNow: 2,
    });
    expect(scene.nodes.filter((n) => n.kind === "agent")).toHaveLength(3);
    expect(scene.nodes.filter((n) => n.kind === "item")).toHaveLength(3);
    expect(scene.nodes.filter((n) => n.kind === "thread")).toHaveLength(2);
    expect(scene.nodes.filter((n) => n.real)).toHaveLength(8);
    expect(statsLine(scene.stats)).toBe(
      "3 agents · 2 tasks this week · 2 working now"
    );
    // Decoration carries no words.
    expect(
      scene.nodes.filter((n) => !n.real).every((n) => n.label === null)
    ).toBe(true);
  });

  it("links real items to their agent, to each other and to their threads", () => {
    const scene = buildMapScene(input, 9, 1200, 800);
    const idx = (kind: string, id: string) =>
      scene.nodes.findIndex((n) => n.kind === kind && n.id === id);
    const has = (a: number, b: number) =>
      scene.edges.some(
        ([p, q]) => (p === a && q === b) || (p === b && q === a)
      );
    expect(has(idx("agent", "a1"), idx("item", "i1"))).toBe(true);
    expect(has(idx("item", "i1"), idx("item", "i2"))).toBe(true);
    expect(has(idx("item", "i1"), idx("thread", "t1"))).toBe(true);
  });

  it("fills a new account with decoration, dimmer than real nodes", () => {
    const empty = buildMapScene(
      { now: NOW, sources: [], agents: [], items: [], threads: [] },
      3,
      1200,
      800
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
    expect(empty.stats).toEqual({
      agents: 0,
      tasksThisWeek: 0,
      messagesThisWeek: 0,
      workingNow: 0,
    });
  });

  it("marks only agents that are working now", () => {
    const scene = buildMapScene(input, 5, 1200, 800);
    const marked = scene.nodes.filter((n) => n.active);
    expect(marked.map((n) => n.id).sort()).toEqual(["a1", "a3"]);
    expect(marked.every((n) => n.kind === "agent")).toBe(true);
  });

  it("hides the owner's words in presentation mode, keeps agent names", () => {
    const scene = buildMapScene(input, 5, 1200, 800);
    const item = scene.nodes.find((n) => n.kind === "item")!;
    const thread = scene.nodes.find((n) => n.kind === "thread")!;
    const agent = scene.nodes.find((n) => n.kind === "agent")!;
    expect(nodeLabel(item, false)).toBe(item.label);
    expect(nodeLabel(item, true)).toBe("Task");
    expect(nodeLabel(thread, true)).toBe("Review");
    expect(nodeLabel(agent, true)).toBe(agent.label);
  });

  it("calls out only real finished work, newest first, up to three", () => {
    const scene = buildMapScene(input, 11, 1200, 800);
    expect(scene.results.map((r) => r.id)).toEqual(["i1", "i3"]);
    expect(scene.results[0].title).toBe("Posted the draft to the hub");
  });

  it("stays inside the element budget with a large account", () => {
    const big: MapInput = {
      now: NOW,
      sources: input.sources,
      agents: Array.from({ length: 40 }, (_, i) => ({
        id: `a${i}`,
        name: `A${i}`,
        active: false,
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

  it("turns vertical on a tall canvas: sources on top, results below", () => {
    const scene = buildMapScene(input, 4, 390, 640);
    expect(scene.phone).toBe(true);
    expect(scene.streams.every((s) => s.y0 < 0)).toBe(true);
    expect(scene.results.every((r) => r.y > 640 * 0.75)).toBe(true);
    expect(scene.results.length).toBeLessThanOrEqual(2);
    expect(scene.exits).toHaveLength(0);
  });
});
