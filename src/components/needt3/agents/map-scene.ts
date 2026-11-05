/**
 * The Agents Map: a pure function from (hub data, seed, size) to a scene the
 * canvas draws. Nothing here touches the DOM, so one seed always gives one
 * picture and the unit test can check it. The geometry follows the owner's
 * reference (additions-4/agents-map/map.html, 05.11.26).
 *
 * Read left to right (top to bottom on a phone): the person's sources send
 * bundles of threads into the constellation, which is Needt — agents, their
 * items and their threads — and finished results leave it on the far side.
 *
 * Real data decides the counts and the connections; the seed decides the
 * shape. A new account has little data, so decorative nodes fill the picture.
 * They look the same but are dimmer, carry no label, and the numbers in
 * `stats` never include them.
 *
 * Colour: monochrome plus one blue (owner, 05.11.26), on thin lines and
 * dots inside the night panel only; no surface or button takes it.
 */
import { newDate } from "@/lib/date-utils";

export type Rgb = readonly [number, number, number];

export type SourceKind =
  | "calendar"
  | "mail"
  | "tasks"
  | "docs"
  | "habits"
  | "service";

export interface MapSourceInput {
  id: string;
  label: string;
  kind: SourceKind;
}

export interface MapAgentInput {
  id: string;
  name: string;
  /**
   * Working right now: the assignee of an item in progress, or holding an
   * active reservation. Its rings run at full strength.
   */
  active: boolean;
  /** Seen in the last 10 minutes: a soft pulse only, no accent. */
  seen: boolean;
}

export interface MapItemInput {
  id: string;
  title: string;
  status: string;
  assigneeId: string | null;
  /** Ids of items this one is related to (blocks, parent, relates, ...). */
  related: string[];
  updatedAt: string;
  createdAt?: string;
  result: string | null;
}

export interface MapThreadInput {
  id: string;
  subject: string;
  itemId: string | null;
  lastMessageAt: string;
}

export interface MapInput {
  sources: MapSourceInput[];
  agents: MapAgentInput[];
  items: MapItemInput[];
  threads: MapThreadInput[];
  /** Epoch ms; passed in so the builder stays pure. */
  now: number;
}

/**
 * `GET /api/agent-hub/overview?graph=1` adds this: the Map's compact links
 * and counts, without titles or message text.
 */
export interface MapGraph {
  /** Start of the first day counted, UTC. */
  since: string;
  /** Agent id -> events per UTC day, oldest first, today last. */
  activity: Record<string, number[]>;
  /** Threads as links only: no subject, no text. */
  threads: { id: string; itemId: string | null; lastMessageAt: string }[];
  messagesThisWeek: number;
}

export type NodeKind = "agent" | "item" | "thread" | "deco";

export interface MapNode {
  /** The hub id for real nodes; an index for decoration. */
  id: string;
  kind: NodeKind;
  /** px inside the panel. */
  x: number;
  y: number;
  /** Radius in px. */
  r: number;
  hue: Rgb;
  real: boolean;
  active: boolean;
  seen: boolean;
  /** The owner's own words (task title, agent name); null on decoration. */
  label: string | null;
  /** 0..2π, offsets this node's twinkle. */
  phase: number;
  /** Distance from the core, 1 at the ellipse edge (the heartbeat wave). */
  d: number;
}

/** A cubic Bézier in px, from a source (or a node) to a node (or the edge). */
export interface MapStream {
  /** Index into `sources`; -1 for an exit. */
  source: number;
  /** The node the curve ends at (streams) or starts from (exits). */
  node: number;
  x0: number;
  y0: number;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  /** Exits only: the fixed end past the right edge. */
  x1: number;
  y1: number;
  hue: Rgb;
  width: number;
  alpha: number;
  /** Fraction of the curve per second. */
  speed: number;
  offset: number;
  sway: number;
}

export interface MapSource {
  id: string;
  label: string;
  kind: SourceKind;
  hue: Rgb;
}

export interface MapResult {
  id: string;
  title: string;
  by: string | null;
  at: string;
  hue: Rgb;
  node: number;
  /** Where the leader line ends and the card hangs, px. */
  x: number;
  y: number;
}

export interface MapStats {
  agents: number;
  tasksThisWeek: number;
  messagesThisWeek: number;
  workingNow: number;
}

export interface MapScene {
  seed: number;
  phone: boolean;
  width: number;
  height: number;
  core: { x: number; y: number; rx: number; ry: number };
  sources: MapSource[];
  nodes: MapNode[];
  edges: [number, number][];
  /** Edge indices per node, for hover and the pulses' walks. */
  adj: number[][];
  streams: MapStream[];
  exits: MapStream[];
  /** Node indices of the agents. */
  agents: number[];
  results: MapResult[];
  stats: MapStats;
}

/** Everything the canvas keeps on screen stays under this. */
export const MAP_BUDGET = 600;
/** Below this width the scene stands on end, as on a phone. */
export const PHONE_WIDTH = 700;

export const WHITE: Rgb = [246, 245, 250];

/**
 * Monochrome with one blue (owner, 05.11.26: no orange, no yellow). Sources
 * and agents are told apart by brightness; blue is kept for what is alive
 * right now: the agents working, and the glow behind the core.
 */
export const BLUE: Rgb = [92, 140, 255];
const GREYS: Rgb[] = [
  [246, 245, 250],
  [214, 214, 224],
  [184, 186, 200],
  [156, 160, 178],
  [130, 134, 154],
];
const SOURCE_HUE: Record<SourceKind, Rgb> = {
  calendar: GREYS[0],
  tasks: GREYS[1],
  mail: GREYS[2],
  docs: GREYS[3],
  habits: GREYS[4],
  service: GREYS[2],
};
const SERVICE_HUES: Rgb[] = [GREYS[1], GREYS[3], GREYS[0], GREYS[4]];
const AGENT_HUES: Rgb[] = GREYS;

/** Needt's own places: every account has them, so the left edge is never bare. */
const OWN_SOURCES: MapSourceInput[] = [
  { id: "own-calendar", label: "Calendar", kind: "calendar" },
  { id: "own-tasks", label: "Tasks", kind: "tasks" },
  { id: "own-docs", label: "Documents", kind: "docs" },
  { id: "own-habits", label: "Habits", kind: "habits" },
];

const MAX_SOURCES = 7;
const WEEK = 7 * 24 * 60 * 60 * 1000;

/** mulberry32: small, fast, and the same everywhere. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed for a fresh visit or a new layout. */
export function freshSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

export function mix(a: Rgb, b: Rgb, k: number): Rgb {
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ];
}

function time(iso: string | undefined) {
  const t = iso ? newDate(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** The real numbers in the hero pill. Decorative nodes never count. */
export function mapStats(input: MapInput): MapStats {
  const since = input.now - WEEK;
  return {
    agents: input.agents.length,
    tasksThisWeek: input.items.filter(
      (i) => time(i.createdAt ?? i.updatedAt) >= since
    ).length,
    messagesThisWeek: input.threads.filter(
      (t) => time(t.lastMessageAt) >= since
    ).length,
    workingNow: input.agents.filter((a) => a.active).length,
  };
}

/** The hero pill: real counts only. */
export function statsLine(stats: MapStats) {
  const n = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
  return [
    n(stats.agents, "agent", "agents"),
    `${n(stats.tasksThisWeek, "task", "tasks")} this week`,
    `${stats.workingNow} working now`,
  ].join(" · ");
}

/**
 * Build the scene for a panel of `width` × `height` px. Below
 * `PHONE_WIDTH` it stands on end: sources on top, two results at the bottom.
 */
export function buildMapScene(
  input: MapInput,
  seed: number,
  width: number,
  height: number
): MapScene {
  const rand = rng(seed);
  const gauss = () => {
    let u = 0;
    let v = 0;
    while (!u) u = rand();
    while (!v) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const W = Math.max(1, width);
  const H = Math.max(1, height);
  const phone = W < PHONE_WIDTH;
  const core = phone
    ? { x: W * 0.5, y: H * 0.5, rx: W * 0.38, ry: H * 0.17 }
    : { x: W * 0.6, y: H * 0.53, rx: W * 0.085, ry: H * 0.37 };
  const lobes = Array.from({ length: 4 }, () => ({
    a: rand() * Math.PI * 2,
    k: 0.15 + rand() * 0.3,
  }));

  // The element budget: nodes, then threads in and out, then lines.
  const nodeCount = phone ? 130 : 200;
  const streamCount = phone ? 84 : 112;
  const exitCount = phone ? 0 : 24;
  const edgeBudget = MAP_BUDGET - nodeCount - streamCount - exitCount;

  // Places for every node first; real data then takes some of them.
  const nodes: MapNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.min(1.1, Math.pow(rand(), 0.6) * (0.85 + 0.25 * rand()));
    let bump = 1;
    for (const l of lobes) bump += l.k * Math.cos(a - l.a) * 0.5;
    const x = core.x + Math.cos(a) * core.rx * r * bump;
    const y = core.y + Math.sin(a) * core.ry * r * bump;
    nodes.push({
      id: String(i),
      kind: "deco",
      x,
      y,
      r: 0.7 + rand() * 1.5,
      hue: WHITE,
      real: false,
      active: false,
      seen: false,
      label: null,
      phase: rand() * Math.PI * 2,
      d: Math.hypot((x - core.x) / core.rx, (y - core.y) / core.ry),
    });
  }
  // Agents take places near the core; the rest go in shuffled order.
  const order = nodes
    .map((n, i) => ({ i, k: n.d + rand() * 0.6 }))
    .sort((p, q) => p.k - q.k)
    .map((p) => p.i);
  const byId = new Map<string, number>();
  const agents: number[] = [];
  const agentRows = input.agents.slice(0, 16);
  agentRows.forEach((agent, k) => {
    const i = order[k];
    Object.assign(nodes[i], {
      id: agent.id,
      kind: "agent",
      r: 3.4,
      // Working now: the one blue. Otherwise a grey of its own.
      hue: agent.active ? BLUE : AGENT_HUES[k % AGENT_HUES.length],
      real: true,
      active: agent.active,
      seen: agent.seen,
      label: agent.name,
    });
    byId.set("agent:" + agent.id, i);
    agents.push(i);
  });
  const rest = order.slice(agentRows.length);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  // A third of the places stay decoration, so the picture keeps its depth.
  const realRoom = Math.floor(rest.length * 0.66);
  let at = 0;
  const items = input.items.slice(0, realRoom);
  const realEdges: [number, number][] = [];
  for (const item of items) {
    const i = rest[at++];
    const owner = item.assigneeId
      ? byId.get("agent:" + item.assigneeId)
      : undefined;
    Object.assign(nodes[i], {
      id: item.id,
      kind: "item",
      r: 1.9,
      hue: owner !== undefined ? mix(WHITE, nodes[owner].hue, 0.55) : WHITE,
      real: true,
      label: item.title,
    });
    byId.set("item:" + item.id, i);
    if (owner !== undefined) realEdges.push([owner, i]);
  }
  for (const item of items) {
    const from = byId.get("item:" + item.id);
    if (from === undefined) continue;
    for (const other of item.related) {
      const to = byId.get("item:" + other);
      if (to !== undefined) realEdges.push([from, to]);
    }
  }
  const threads = input.threads.slice(0, Math.max(0, realRoom - items.length));
  for (const thread of threads) {
    const i = rest[at++];
    Object.assign(nodes[i], {
      id: thread.id,
      kind: "thread",
      r: 1.6,
      real: true,
      label: thread.subject,
    });
    const near = thread.itemId ? byId.get("item:" + thread.itemId) : undefined;
    if (near !== undefined) realEdges.push([near, i]);
  }

  // Lines: the real links first, then each node to its nearest three and an
  // occasional long one, up to the budget.
  const edges: [number, number][] = [];
  const seen = new Set<number>();
  const push = (a: number, b: number) => {
    if (a === b || edges.length >= edgeBudget) return;
    const k = pairKey(a, b);
    if (seen.has(k)) return;
    seen.add(k);
    edges.push([a, b]);
  };
  for (const [a, b] of realEdges) push(a, b);
  const near = nodes.map((_, i) => nearest(nodes, i, 3));
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < nodes.length; i++) push(i, near[i][k]);
  }
  for (let i = 0; i < nodes.length; i++) {
    if (rand() < 0.07) push(i, Math.floor(rand() * nodes.length));
  }
  const adj: number[][] = nodes.map(() => []);
  edges.forEach(([a, b], e) => {
    adj[a].push(e);
    adj[b].push(e);
  });

  // Sources: what the person connected, then Needt's own places.
  const sources: MapSource[] = [];
  let service = 0;
  for (const s of input.sources.slice(0, MAX_SOURCES - 2)) {
    const hue =
      s.kind === "service"
        ? SERVICE_HUES[service++ % SERVICE_HUES.length]
        : SOURCE_HUE[s.kind];
    sources.push({ id: s.id, label: s.label, kind: s.kind, hue });
  }
  for (const own of OWN_SOURCES) {
    if (sources.length >= MAX_SOURCES) break;
    if (sources.some((s) => s.kind === own.kind)) continue;
    sources.push({ ...own, hue: SOURCE_HUE[own.kind] });
  }

  // Threads into the cluster, a bundle per source with its own bend.
  const streams: MapStream[] = [];
  const perSource = Math.floor(streamCount / sources.length);
  sources.forEach((source, s) => {
    const anchor = phone
      ? W * (0.08 + (0.84 * (s + 0.5)) / sources.length)
      : H * (0.14 + (0.72 * (s + 0.5)) / sources.length);
    const bend = (rand() - 0.5) * (phone ? H * 0.2 : H * 0.55);
    for (let k = 0; k < perSource; k++) {
      const node = Math.floor(rand() * nodes.length);
      const t = nodes[node];
      if (t.kind !== "agent" && rand() < 0.5)
        t.hue = mix(WHITE, source.hue, 0.55);
      const spread = gauss() * (phone ? 10 : 18);
      const x0 = phone ? anchor + spread : -20;
      const y0 = phone ? -10 : anchor + spread;
      streams.push({
        source: s,
        node,
        x0,
        y0,
        c1x: phone ? x0 + gauss() * 20 : W * 0.2 + gauss() * 30,
        c1y: phone ? H * 0.16 + gauss() * 16 : y0 + bend * 0.45,
        c2x: phone ? t.x + gauss() * 50 : W * 0.4 + gauss() * 60,
        c2y: phone ? H * 0.28 + gauss() * 20 : t.y + bend * 0.25 + gauss() * 50,
        x1: t.x,
        y1: t.y,
        hue: source.hue,
        width: 0.35 + rand() * 0.75,
        alpha: 0.07 + rand() * 0.16,
        speed: 0.05 + rand() * 0.07,
        offset: rand(),
        sway: rand() * Math.PI * 2,
      });
    }
  });
  // Threads out past the right edge: work leaving Needt.
  const exits: MapStream[] = [];
  for (let i = 0; i < exitCount; i++) {
    const node = Math.floor(rand() * nodes.length);
    const n = nodes[node];
    const ey = H * (0.06 + rand() * 0.88);
    exits.push({
      source: -1,
      node,
      x0: n.x,
      y0: n.y,
      c1x: W * 0.76,
      c1y: n.y + gauss() * 70,
      c2x: W * 0.9,
      c2y: ey + gauss() * 40,
      x1: W + 40,
      y1: ey,
      hue: n.hue,
      width: 0.3 + rand() * 0.5,
      alpha: 0.05 + rand() * 0.09,
      speed: 0.04 + rand() * 0.05,
      offset: rand(),
      sway: rand() * 6,
    });
  }

  // Results: the real finished items only, from the agent that did them.
  const agentName = new Map(input.agents.map((a) => [a.id, a.name]));
  const done = input.items
    .filter((i) => i.status === "done")
    .sort((a, b) => time(b.updatedAt) - time(a.updatedAt))
    .slice(0, phone ? 2 : 3);
  const results: MapResult[] = done.map((item, i) => {
    const node =
      (item.assigneeId ? byId.get("agent:" + item.assigneeId) : undefined) ??
      byId.get("item:" + item.id) ??
      agents[0] ??
      0;
    return {
      id: item.id,
      title: item.result || item.title,
      by: item.assigneeId ? (agentName.get(item.assigneeId) ?? null) : null,
      at: item.updatedAt,
      hue: nodes[node].hue,
      node,
      x: phone ? W * (0.26 + 0.48 * i) : W * 0.79,
      y: phone ? H - 120 : H * (0.27 + 0.24 * i),
    };
  });

  return {
    seed,
    phone,
    width: W,
    height: H,
    core,
    sources,
    nodes,
    edges,
    adj,
    streams,
    exits,
    agents,
    results,
    stats: mapStats(input),
  };
}

function pairKey(a: number, b: number) {
  return a < b ? a * 100000 + b : b * 100000 + a;
}

function nearest(nodes: MapNode[], i: number, count: number) {
  const best: { j: number; d: number }[] = [];
  const n = nodes[i];
  for (let j = 0; j < nodes.length; j++) {
    if (j === i) continue;
    const dx = nodes[j].x - n.x;
    const dy = nodes[j].y - n.y;
    const d = dx * dx + dy * dy;
    if (best.length < count || d < best[best.length - 1].d) {
      if (best.length === count) best.pop();
      best.push({ j, d });
      best.sort((p, q) => p.d - q.d);
    }
  }
  return best.map((b) => b.j);
}

/** Lines, threads and nodes the canvas keeps on screen for this scene. */
export function sceneSize(scene: MapScene) {
  return (
    scene.nodes.length +
    scene.edges.length +
    scene.streams.length +
    scene.exits.length
  );
}

/**
 * What a node says on hover. In presentation mode the owner's words go:
 * a task reads "Task", a thread "Review"; agent names stay.
 */
export function nodeLabel(node: MapNode, presentation: boolean) {
  if (!node.real || !node.label) return null;
  if (!presentation || node.kind === "agent") return node.label;
  return node.kind === "thread" ? "Review" : "Task";
}
