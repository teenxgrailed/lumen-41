/**
 * The Agents Map: a pure function from (hub data, seed, size) to a scene the
 * canvas draws. Nothing here touches the DOM, so one seed always gives one
 * picture and the unit test can check it. The look is the owner's chosen
 * "Constellation" (additions-4/agents-variants/a-constellation.html,
 * 05.11.26): a dense constellation, bundles of source threads from the left,
 * result pills with a progress ring on the right.
 *
 * Real data decides the counts and the connections; the seed decides the
 * shape. A new account has little data, so decorative nodes fill the picture.
 * They look the same but carry no label, and `stats` never counts them.
 *
 * Colour: white ink on near black with one cold blue glow. Status colours
 * appear only as marks on an agent (its dot, its rings, its nearest lines,
 * its pulses and the ring of its pill): red when it is broken or needs you
 * urgently, orange when it waits for your answer in Chat, blue while it
 * works, green when all is well (owner, 05.11.26).
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

/**
 * - alert: broken or urgent (a failed item, a revoked token, an approval
 *   waiting on a risky step);
 * - waiting: asks you something in Chat;
 * - working: an item in progress, or a reservation held;
 * - ok: all is well.
 */
export type AgentStatus = "alert" | "waiting" | "working" | "ok";

export interface MapSourceInput {
  id: string;
  label: string;
  kind: SourceKind;
}

export interface MapAgentInput {
  id: string;
  name: string;
  status: AgentStatus;
  /** Seen in the last 10 minutes: a soft pulse only. */
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
  /** Done-when checklist progress, when the item has one. */
  criteria?: { met: number; all: number } | null;
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
  /** Base position in px; the canvas breathes and drifts it. */
  x: number;
  y: number;
  /** Radius in px. */
  r: number;
  /** Depth 0.5..1: how far the pointer parallax moves it. */
  z: number;
  real: boolean;
  /** Agents only; "ok" for everything else. */
  status: AgentStatus;
  seen: boolean;
  /** The owner's own words (task title, agent name); null on decoration. */
  label: string | null;
  /** 0..2π, offsets this node's twinkle. */
  phase: number;
  /** Distance from the core, 1 at the ellipse edge (reveal and waves). */
  d: number;
}

export interface MapEdge {
  a: number;
  b: number;
  /** Shimmer phase and rate. */
  phase: number;
  rate: number;
}

/** One source thread: a cubic Bézier in px into a node of the cluster. */
export interface MapStream {
  source: number;
  node: number;
  x0: number;
  y0: number;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
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
  /** Short form for a phone. */
  short: string;
  kind: SourceKind;
  /** Where the name sits, px. */
  x: number;
  y: number;
}

/** A result pill on the right: progress ring, title, who and when. */
export interface MapResult {
  id: string;
  title: string;
  by: string | null;
  at: string;
  /** 0..1, the ring. */
  progress: number;
  /** The agent the leader line starts from (its status colours the ring). */
  node: number;
  status: AgentStatus;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapStats {
  agents: number;
  tasksThisWeek: number;
  messagesThisWeek: number;
  workingNow: number;
  /** Agents waiting on your answer: the dot on the Chat tab. */
  waiting: number;
}

export interface MapScene {
  seed: number;
  phone: boolean;
  width: number;
  height: number;
  core: { x: number; y: number; rx: number; ry: number };
  sources: MapSource[];
  nodes: MapNode[];
  edges: MapEdge[];
  /** Edge indices per node, for hover and the pulses' walks. */
  adj: number[][];
  streams: MapStream[];
  /** Node indices of the agents. */
  agents: number[];
  results: MapResult[];
  stats: MapStats;
}

/** Nodes, lines and threads the canvas keeps on screen stay under this. */
export const MAP_BUDGET = 600;
/** Below this width the scene stands on end, as on a phone. */
export const PHONE_WIDTH = 700;

export const WHITE: Rgb = [236, 242, 255];
/** The one ambient colour: the cold blue glow. */
export const BLUE: Rgb = [90, 169, 255];
/** Status marks on an agent; never a surface. */
export const STATUS_HUE: Record<AgentStatus, Rgb> = {
  alert: [255, 96, 96],
  waiting: [255, 163, 72],
  working: BLUE,
  ok: [96, 214, 150],
};
const STATUS_RANK: Record<AgentStatus, number> = {
  alert: 3,
  waiting: 2,
  working: 1,
  ok: 0,
};

/** Needt's own places: every account has them, so the left edge is never bare. */
const OWN_SOURCES: (MapSourceInput & { short: string })[] = [
  { id: "own-calendar", label: "Calendar", short: "Cal", kind: "calendar" },
  { id: "own-tasks", label: "Tasks", short: "Tasks", kind: "tasks" },
  { id: "own-docs", label: "Documents", short: "Docs", kind: "docs" },
  { id: "own-habits", label: "Habits", short: "Habits", kind: "habits" },
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

/** The worst of several statuses: alert over waiting over working over ok. */
export function worstStatus(list: AgentStatus[]): AgentStatus {
  return list.reduce<AgentStatus>(
    (worst, s) => (STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst),
    "ok"
  );
}

/** The real numbers in the pill. Decorative nodes never count. */
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
    workingNow: input.agents.filter((a) => a.status === "working").length,
    waiting: input.agents.filter((a) => a.status === "waiting").length,
  };
}

/** The pill: real counts only. */
export function statsLine(stats: MapStats) {
  const n = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
  return [
    n(stats.agents, "agent", "agents"),
    `${n(stats.tasksThisWeek, "task", "tasks")} this week`,
    `${stats.workingNow} working now`,
  ].join(" · ");
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * Build the scene for a canvas of `width` × `height` px. Below
 * `PHONE_WIDTH` it stands on end: sources across the top, two pills at the
 * bottom.
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
    ? { x: W * 0.5, y: H * 0.42, rx: W * 0.44, ry: H * 0.245 }
    : { x: W * 0.545, y: H * 0.5, rx: W * 0.2, ry: H * 0.43 };

  // The budget: nodes first, then the source threads, then lines.
  const nodeCount = phone ? 150 : 260;
  const perSourceCap = phone ? 9 : 14;

  // Nodes in a few soft clusters inside the ellipse.
  const clusters = Array.from({ length: 5 }, () => ({
    x: gauss() * 0.32,
    y: gauss() * 0.5,
    s: 0.14 + rand() * 0.16,
  }));
  const nodes: MapNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const c = clusters[Math.floor(rand() * clusters.length)];
    let ux = c.x + gauss() * c.s;
    let uy = c.y + gauss() * c.s * 1.4;
    const m = Math.hypot(ux, uy);
    if (m > 1.1) {
      ux *= 1.1 / m;
      uy *= 1.1 / m;
    }
    const x = core.x + ux * core.rx * 1.05;
    const y = clamp(core.y + uy * core.ry, 36, H - 96);
    nodes.push({
      id: String(i),
      kind: "deco",
      x,
      y,
      r: 0.7 + rand() * 1.3,
      z: 0.5 + rand() * 0.5,
      real: false,
      status: "ok",
      seen: false,
      label: null,
      phase: rand() * Math.PI * 2,
      d: Math.hypot((x - core.x) / core.rx, (y - core.y) / core.ry),
    });
  }

  // Results first, so their agents can sit toward the pills.
  const agentName = new Map(input.agents.map((a) => [a.id, a.name]));
  const resultItems = input.items
    .filter(
      (i) =>
        i.status === "done" ||
        (i.status === "in_progress" && (i.criteria?.all ?? 0) > 0)
    )
    .sort((a, b) => time(b.updatedAt) - time(a.updatedAt))
    .slice(0, phone ? 2 : 3);
  const pillOwners = new Set(
    resultItems.map((i) => i.assigneeId).filter(Boolean) as string[]
  );

  // Agents near the core, spaced apart; pill owners lean right.
  const byId = new Map<string, number>();
  const agents: number[] = [];
  const gap = phone ? 62 : 110;
  for (const agent of input.agents.slice(0, 16)) {
    const right = !phone && pillOwners.has(agent.id);
    let best = -1;
    for (let tries = 0; tries < 600 && best < 0; tries++) {
      const j = Math.floor(rand() * nodeCount);
      const n = nodes[j];
      if (n.kind !== "deco" || n.d > 0.6) continue;
      if (right && n.x < core.x + core.rx * 0.05) continue;
      if (
        agents.some((q) => Math.hypot(nodes[q].x - n.x, nodes[q].y - n.y) < gap)
      )
        continue;
      best = j;
    }
    if (best < 0) {
      best = nodes.findIndex((n) => n.kind === "deco");
      if (best < 0) break;
    }
    Object.assign(nodes[best], {
      id: agent.id,
      kind: "agent",
      r: 3.4,
      real: true,
      status: agent.status,
      seen: agent.seen,
      label: agent.name,
    });
    byId.set("agent:" + agent.id, best);
    agents.push(best);
  }

  // Items and threads take random places; a third stays decoration.
  const free = nodes
    .map((n, i) => (n.kind === "deco" ? i : -1))
    .filter((i) => i >= 0);
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  const room = Math.floor(free.length * 0.66);
  let at = 0;
  const realLinks: [number, number][] = [];
  const items = input.items.slice(0, room);
  for (const item of items) {
    const i = free[at++];
    Object.assign(nodes[i], {
      id: item.id,
      kind: "item",
      r: 1.8,
      real: true,
      label: item.title,
    });
    byId.set("item:" + item.id, i);
    const owner = item.assigneeId
      ? byId.get("agent:" + item.assigneeId)
      : undefined;
    if (owner !== undefined) realLinks.push([owner, i]);
  }
  for (const item of items) {
    const from = byId.get("item:" + item.id);
    if (from === undefined) continue;
    for (const other of item.related) {
      const to = byId.get("item:" + other);
      if (to !== undefined) realLinks.push([from, to]);
    }
  }
  for (const thread of input.threads.slice(
    0,
    Math.max(0, room - items.length)
  )) {
    const i = free[at++];
    Object.assign(nodes[i], {
      id: thread.id,
      kind: "thread",
      r: 1.6,
      real: true,
      label: thread.subject,
    });
    const near = thread.itemId ? byId.get("item:" + thread.itemId) : undefined;
    if (near !== undefined) realLinks.push([near, i]);
  }

  // Sources: what the person connected, then Needt's own places.
  const sourceRows: (MapSourceInput & { short: string })[] = [];
  for (const s of input.sources.slice(0, MAX_SOURCES - 2))
    sourceRows.push({ ...s, short: s.label.split(" ")[0].slice(0, 7) });
  for (const own of OWN_SOURCES) {
    if (sourceRows.length >= MAX_SOURCES) break;
    if (sourceRows.some((s) => s.kind === own.kind)) continue;
    sourceRows.push(own);
  }
  const count = sourceRows.length;
  const anchorOf = (si: number) =>
    phone
      ? W * (0.08 + (0.84 * (si + 0.5)) / count)
      : H * (0.15 + (0.7 * (si + 0.5)) / count);
  const sources: MapSource[] = sourceRows.map((s, si) => ({
    id: s.id,
    label: s.label,
    short: s.short,
    kind: s.kind,
    x: phone ? anchorOf(si) : 30,
    y: phone ? 54 : anchorOf(si) - 8,
  }));

  // Threads: a trunk per source, fanning out into the near half of the
  // constellation.
  const near = nodes
    .map((n, i) => ({ i, k: phone ? n.y : n.x }))
    .sort((p, q) => p.k - q.k)
    .slice(0, Math.floor(nodeCount * 0.5))
    .map((p) => p.i);
  const streamCount = Math.min(perSourceCap * count, phone ? 84 : 98);
  const per = Math.max(1, Math.floor(streamCount / count));
  const streams: MapStream[] = [];
  sourceRows.forEach((_, si) => {
    const anchor = anchorOf(si);
    const trunk = {
      x: phone ? anchor + gauss() * 16 : W * 0.2,
      y: phone ? H * 0.13 : anchor + (rand() - 0.5) * H * 0.3,
    };
    for (let k = 0; k < per; k++) {
      const node = near[Math.floor(rand() * near.length)];
      const t = nodes[node];
      const spread = gauss() * (phone ? 5 : 9);
      const x0 = phone ? anchor + spread : 134;
      const y0 = phone ? 78 : anchor + spread;
      streams.push({
        source: si,
        node,
        x0,
        y0,
        c1x: trunk.x + gauss() * 8,
        c1y: trunk.y + gauss() * 8 + (phone ? 0 : (trunk.y - anchor) * 0.2),
        c2x: phone ? t.x + gauss() * 40 : t.x - 120 - rand() * 90,
        c2y: phone ? t.y - 70 - rand() * 60 : t.y + gauss() * 40,
        width: 0.35 + rand() * 0.55,
        alpha: 0.05 + rand() * 0.08,
        speed: 0.04 + rand() * 0.06,
        offset: rand(),
        sway: rand() * Math.PI * 2,
      });
    }
  });

  // Lines: the real links first, then nearest neighbours (seven for an
  // agent, three for the rest) within reach, and a few longer ones.
  const edgeBudget = MAP_BUDGET - nodes.length - streams.length;
  const edges: MapEdge[] = [];
  const seen = new Set<number>();
  const push = (a: number, b: number) => {
    if (a === b || edges.length >= edgeBudget) return;
    const k = a < b ? a * 100000 + b : b * 100000 + a;
    if (seen.has(k)) return;
    seen.add(k);
    edges.push({ a, b, phase: rand() * Math.PI * 2, rate: 0.6 + rand() * 1.2 });
  };
  for (const [a, b] of realLinks) push(a, b);
  const reach = (phone ? 70 : 95) ** 2;
  const order = nodes
    .map((_, i) => i)
    .sort((p, q) => {
      // Agents first, so their spokes survive the budget.
      const pa = nodes[p].kind === "agent" ? 0 : 1;
      const qa = nodes[q].kind === "agent" ? 0 : 1;
      return pa - qa;
    });
  for (const i of order) {
    const want = nodes[i].kind === "agent" ? 7 : 3;
    for (const [j, d] of nearest(nodes, i, want)) if (d < reach) push(i, j);
  }
  for (let i = 0; i < nodes.length; i++) {
    if (rand() < 0.07) {
      const far = nearest(nodes, i, 9);
      const pick = far[4 + Math.floor(rand() * Math.max(1, far.length - 4))];
      if (pick && pick[1] < reach * 2) push(i, pick[0]);
    }
  }
  const adj: number[][] = nodes.map(() => []);
  edges.forEach((e, k) => {
    adj[e.a].push(k);
    adj[e.b].push(k);
  });

  // Result pills: real items only, from the agent that holds them.
  const results: MapResult[] = resultItems.map((item, i) => {
    const owner =
      (item.assigneeId ? byId.get("agent:" + item.assigneeId) : undefined) ??
      byId.get("item:" + item.id) ??
      agents[0] ??
      0;
    const w = phone ? W - 32 : 272;
    const h = phone ? 60 : 68;
    const progress =
      item.status === "done"
        ? 1
        : item.criteria && item.criteria.all > 0
          ? item.criteria.met / item.criteria.all
          : 0;
    return {
      id: item.id,
      title: item.result || item.title,
      by: item.assigneeId ? (agentName.get(item.assigneeId) ?? null) : null,
      at: item.updatedAt,
      progress,
      node: owner,
      status: nodes[owner]?.status ?? "ok",
      x: phone ? 16 : W - w - 40,
      y: phone ? H - 268 + i * 72 : H * (0.25 + 0.2 * i) - h / 2,
      w,
      h,
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
    agents,
    results,
    stats: mapStats(input),
  };
}

/** The nearest `count` nodes to node `i`, with squared distances. */
function nearest(nodes: MapNode[], i: number, count: number) {
  const best: [number, number][] = [];
  const n = nodes[i];
  for (let j = 0; j < nodes.length; j++) {
    if (j === i) continue;
    const d = (nodes[j].x - n.x) ** 2 + (nodes[j].y - n.y) ** 2;
    if (best.length < count || d < best[best.length - 1][1]) {
      if (best.length === count) best.pop();
      best.push([j, d]);
      best.sort((p, q) => p[1] - q[1]);
    }
  }
  return best;
}

/** Nodes, lines and threads the canvas keeps on screen for this scene. */
export function sceneSize(scene: MapScene) {
  return scene.nodes.length + scene.edges.length + scene.streams.length;
}

/**
 * What a node says on hover. In presentation mode the owner's words go: a
 * task reads "Task", a thread "Review"; agent names stay.
 */
export function nodeLabel(node: MapNode, presentation: boolean) {
  if (!node.real || !node.label) return null;
  if (!presentation || node.kind === "agent") return node.label;
  return node.kind === "thread" ? "Review" : "Task";
}
