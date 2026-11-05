/**
 * The Agents Map: a pure function from (hub data, seed, size) to a scene the
 * canvas draws. Nothing here touches the DOM, so one seed always gives one
 * picture and the unit test can check it. The look is the owner's final
 * reference (additions-4/agents-variants/final.html, approved 05.11.26): a
 * tall glowing core, luminous threads from the left edge and the left
 * corners converging into it (a few flow on out to the right), the person's
 * data riding in from the left, and a column of pills on the right joined
 * to the core by straight callouts.
 *
 * Real data decides the counts and the connections; the seed decides the
 * shape. A new account has little data, so decorative nodes fill the
 * picture. They carry no label, and `stats` never counts them.
 *
 * Colour: white ink on near black, one cold blue glow. Status colours only
 * as marks near an agent: red when it is broken or needs you now, orange
 * when it waits for your answer in Chat, blue while it works, green when all
 * is well (owner, 05.11.26).
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
  /** One line for the hover: "Working · Week plan", "All good", … */
  line: string;
  /** For an alert, the short reason ("connection expired", "a task failed"). */
  reason?: string | null;
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
export type { MapGraph } from "@/services/agent-hub/map-graph-types";

export type NodeKind = "agent" | "item" | "thread" | "deco" | "anchor";

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
  /** Agents (and pill anchors); "ok" for everything else. */
  status: AgentStatus;
  seen: boolean;
  /** The owner's own words (task title, agent name); null on decoration. */
  label: string | null;
  /** Agents: their status line. Items: "Task", threads: "Thread". */
  sub: string | null;
  /** 0..2π, offsets this node's twinkle. */
  phase: number;
  /** Distance from the core, 1 at its edge (reveal and waves). */
  d: number;
  /** 0..1, how near the nearest agent is (its status tints the node). */
  sw: number;
  /** That agent's node index, or -1. */
  sa: number;
}

export interface MapEdge {
  a: number;
  b: number;
  phase: number;
  rate: number;
  /** Status tint from the nearer agent, 0..1. */
  sw: number;
  sa: number;
  /** Mean distance from the core. */
  d: number;
  /** The link from an agent to its pill's anchor. */
  link: boolean;
}

/**
 * A luminous thread: from the left edge (L), the top-left (T) or the
 * bottom-left (B) into a node, or from a node out past the right edge (O).
 */
export interface MapThread {
  kind: "L" | "T" | "B" | "O";
  /** The node it ends at (L, T, B) or starts from (O). */
  node: number;
  x0: number;
  y0: number;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  /** O only: the end past the right edge. */
  x3: number;
  y3: number;
  /** Approximate length, for the draw-in dash. */
  len: number;
  alpha: number;
  width: number;
  offset: number;
  speed: number;
  sway: number;
  /** Draw-in delay, 0..0.3 of the entry. */
  delay: number;
}

/** A thumbnail or a voice wave riding in from the left. */
export interface MapRider {
  kind: "thumb" | "wave";
  /** Thumbnail art: 0 doc, 1 mail, 2 calendar, 3 picture, 4 glow, 5 code. */
  type: number;
  /** Lane, 0..1 of the height. */
  lane: number;
  offset: number;
  speed: number;
}

/** A pill in the right column. */
export interface MapPill {
  /** Unique key: the agent id. */
  id: string;
  status: AgentStatus;
  title: string;
  sub: string;
  /** 0..1, the ring. */
  progress: number;
  /** What a click opens. */
  go: { kind: "chat" | "agent" | "item"; id: string };
  /** The agent node, and the anchor node on the core's edge (-1 on a phone). */
  agent: number;
  anchor: number;
  /** Shown in Presentation instead of the owner's words. */
  neutral: string;
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
  nodes: MapNode[];
  edges: MapEdge[];
  adj: number[][];
  threads: MapThread[];
  riders: MapRider[];
  /** Neutral data rows on the far left: a type and, for the owner, a title. */
  rows: { type: string; title: string | null }[];
  agents: number[];
  pills: MapPill[];
  stats: MapStats;
}

/** Desktop: nodes, lines and threads the canvas keeps on screen. */
export const MAP_BUDGET = 1000;
/** On a phone the scene is about half. */
export const MAP_BUDGET_PHONE = 520;
/**
 * Below this width the scene is laid out for a phone: under it the right
 * column of pills would cover the core's agents (a tablet in portrait, a
 * narrow window).
 */
export const PHONE_WIDTH = 960;

export const WHITE: Rgb = [236, 242, 255];
/** The one ambient colour: the cold blue glow. */
export const BLUE: Rgb = [90, 169, 255];
/** A paler blue for threads and lit lines. */
export const BLUE_WHITE: Rgb = [150, 195, 255];
/** Status marks near an agent; never a surface. */
export const STATUS_HUE: Record<AgentStatus, Rgb> = {
  alert: [255, 84, 96],
  waiting: [255, 159, 67],
  working: BLUE,
  ok: [72, 214, 138],
};
const STATUS_RANK: Record<AgentStatus, number> = {
  alert: 3,
  waiting: 2,
  working: 1,
  ok: 0,
};
/** Where agents sit inside the core, as fractions of its radii. */
const SLOTS: [number, number][] = [
  [-0.28, -0.42],
  [0.3, -0.2],
  [-0.24, 0.06],
  [0.3, 0.3],
  [-0.1, 0.56],
  [0.12, -0.68],
  [0.16, 0.72],
  [-0.32, -0.08],
];
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

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** The worst of several statuses: alert over waiting over working over ok. */
export function worstStatus(list: AgentStatus[]): AgentStatus {
  return list.reduce<AgentStatus>(
    (worst, s) => (STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst),
    "ok"
  );
}

/** The real numbers in the counts line. Decorative nodes never count. */
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

/** The counts line: real numbers only. */
export function statsLine(stats: MapStats) {
  const n = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
  return [
    n(stats.agents, "agent", "agents"),
    `${n(stats.tasksThisWeek, "task", "tasks")} this week`,
    `${stats.workingNow} working now`,
  ].join(" · ");
}

/** "4 min ago", "2 h ago", "3 d ago" against `now`. */
export function ago(iso: string, now: number) {
  const m = Math.max(0, Math.round((now - time(iso)) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function bezLength(p: number[]) {
  let L = 0;
  let px = p[0];
  let py = p[1];
  for (let k = 1; k <= 10; k++) {
    const t = k / 10;
    const u = 1 - t;
    const x =
      u * u * u * p[0] +
      3 * u * u * t * p[2] +
      3 * u * t * t * p[4] +
      t * t * t * p[6];
    const y =
      u * u * u * p[1] +
      3 * u * u * t * p[3] +
      3 * u * t * t * p[5] +
      t * t * t * p[7];
    L += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  return L * 1.02;
}

/**
 * Build the scene for a canvas of `width` × `height` px. Below
 * `PHONE_WIDTH` it is laid out for a phone: two pills at the bottom with no
 * callouts.
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
    ? { x: W * 0.6, y: H * 0.42, rx: W * 0.15, ry: H * 0.33 }
    : { x: W * 0.62, y: H * 0.5, rx: W * 0.082, ry: H * 0.35 };
  const budget = phone ? MAP_BUDGET_PHONE : MAP_BUDGET;
  const nodeCount = phone ? 180 : 340;
  const threadCount = phone ? 40 : 90;
  const exitCount = phone ? 6 : 14;

  // The core: a tall spindle, widest at its middle.
  const nodes: MapNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const v = clamp(gauss() * 0.5, -1, 1);
    const hw = core.rx * (1.2 - 0.9 * Math.pow(Math.abs(v), 1.6));
    const u = clamp(gauss() * 0.5, -1.25, 1.25);
    const d = Math.hypot(u * 0.8, v);
    nodes.push({
      id: String(i),
      kind: "deco",
      x: core.x + u * hw,
      y: core.y + v * core.ry,
      r:
        0.6 +
        rand() * 0.9 +
        (rand() < 0.22 ? (1.15 - Math.min(1, d)) * 1.8 : 0),
      z: 0.5 + rand() * 0.5,
      real: false,
      status: "ok",
      seen: false,
      label: null,
      sub: null,
      phase: rand() * Math.PI * 2,
      d,
      sw: 0,
      sa: -1,
    });
  }

  // Agents at fixed slots inside the core; a second ring past eight.
  const byId = new Map<string, number>();
  const agents: number[] = [];
  input.agents.slice(0, 16).forEach((agent, k) => {
    const slot = SLOTS[k % SLOTS.length];
    const ring = Math.floor(k / SLOTS.length);
    const tx = core.x + slot[0] * core.rx * (1.4 + ring * 0.5);
    const ty = core.y + slot[1] * core.ry * (1 - ring * 0.15);
    let best = -1;
    let bd = Infinity;
    nodes.forEach((n, j) => {
      if (n.kind !== "deco") return;
      const dd = Math.hypot(n.x - tx, n.y - ty);
      if (dd < bd) {
        bd = dd;
        best = j;
      }
    });
    if (best < 0) return;
    Object.assign(nodes[best], {
      id: agent.id,
      kind: "agent",
      r: 3.4,
      real: true,
      status: agent.status,
      seen: agent.seen,
      label: agent.name,
      sub: agent.line,
    });
    byId.set("agent:" + agent.id, best);
    agents.push(best);
  });

  // Items and threads take random places; half stays decoration.
  const free = nodes
    .map((n, i) => (n.kind === "deco" ? i : -1))
    .filter((i) => i >= 0);
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  const room = Math.floor(free.length * 0.5);
  let at = 0;
  const realLinks: [number, number][] = [];
  const items = input.items.slice(0, room);
  for (const item of items) {
    const i = free[at++];
    Object.assign(nodes[i], {
      id: item.id,
      kind: "item",
      r: Math.max(nodes[i].r, 1.8),
      real: true,
      label: item.title,
      sub: "Task",
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
      r: Math.max(nodes[i].r, 1.6),
      real: true,
      label: thread.subject,
      sub: "Thread",
    });
    const near = thread.itemId ? byId.get("item:" + thread.itemId) : undefined;
    if (near !== undefined) realLinks.push([near, i]);
  }

  // Pills: what needs you first, then what the agents did.
  const latestFor = new Map<string, MapItemInput>();
  for (const item of [...input.items].sort(
    (a, b) => time(b.updatedAt) - time(a.updatedAt)
  )) {
    if (!item.assigneeId || latestFor.has(item.assigneeId)) continue;
    if (
      item.status === "done" ||
      (item.status === "in_progress" && (item.criteria?.all ?? 0) > 0)
    )
      latestFor.set(item.assigneeId, item);
  }
  type Draft = Omit<MapPill, "x" | "y" | "w" | "h" | "anchor">;
  const drafts: Draft[] = [];
  const order = [...input.agents].sort(
    (a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status]
  );
  for (const agent of order) {
    const node = byId.get("agent:" + agent.id);
    if (node === undefined) continue;
    if (agent.status === "alert") {
      const reconnect = agent.reason === "connection expired";
      drafts.push({
        id: agent.id,
        status: "alert",
        title: reconnect
          ? `Reconnect ${agent.name}`
          : `${agent.name} needs you`,
        sub: agent.reason ?? "needs you now",
        progress: 1,
        go: { kind: "agent", id: agent.id },
        agent: node,
        neutral: reconnect
          ? `Reconnect ${agent.name}`
          : `${agent.name} needs you`,
      });
      continue;
    }
    if (agent.status === "waiting") {
      drafts.push({
        id: agent.id,
        status: "waiting",
        title: `${agent.name} is waiting`,
        sub: "for your answer",
        progress: 0.6,
        go: { kind: "chat", id: agent.id },
        agent: node,
        neutral: `${agent.name} is waiting`,
      });
      continue;
    }
    const item = latestFor.get(agent.id);
    if (!item) continue;
    drafts.push({
      id: agent.id,
      status: agent.status,
      title: item.result || item.title,
      sub: `${agent.name} · ${ago(item.updatedAt, input.now)}`,
      progress:
        item.status === "done"
          ? 1
          : item.criteria && item.criteria.all > 0
            ? item.criteria.met / item.criteria.all
            : 0,
      go: { kind: "item", id: item.id },
      agent: node,
      neutral: item.status === "done" ? "Finished task" : "Task in progress",
    });
  }
  const shown = drafts.slice(0, phone ? 2 : 4);
  const pw = phone ? W - 32 : 288;
  const ph = phone ? 58 : 68;
  // Pills never overlap and never leave the canvas, however short it is.
  const step = Math.max(ph + 8, H * 0.17);
  const pills: MapPill[] = shown.map((p, i) => {
    const x = phone ? 16 : W - pw - 44;
    const y = phone
      ? clamp(H - 230 - (shown.length - i) * 66, 12 + i * 66, H - ph - 12)
      : clamp(
          H * 0.5 + (i - (shown.length - 1) / 2) * step - ph / 2,
          12,
          H - ph - 12
        );
    let anchor = -1;
    if (!phone) {
      const yc = y + ph / 2;
      const v = clamp((yc - core.y) / core.ry, -1, 1);
      anchor = nodes.length;
      nodes.push({
        id: `anchor-${p.id}`,
        kind: "anchor",
        x: core.x + core.rx * (1.2 - 0.9 * Math.pow(Math.abs(v), 1.6)) * 0.82,
        y: yc,
        r: 3,
        z: 0.8,
        real: false,
        status: p.status,
        seen: false,
        label: null,
        sub: null,
        phase: 1,
        d: 0.5,
        sw: 0,
        sa: -1,
      });
    }
    return { ...p, anchor, x, y, w: pw, h: ph };
  });

  // Threads into the core from the left edge and corners, a few out right.
  const left = nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n.kind !== "anchor" && n.x < core.x + core.rx * 0.15);
  const threads: MapThread[] = [];
  const gx = core.x - W * 0.06;
  for (let i = 0; i < threadCount && left.length; i++) {
    const a = left[Math.floor(rand() * left.length)];
    const b = left[Math.floor(rand() * left.length)];
    const node = a.n.d < b.n.d ? a.i : b.i;
    const t = nodes[node];
    const r10 = i % 10;
    const kind: MapThread["kind"] = r10 < 5 ? "L" : r10 < 8 ? "T" : "B";
    let p: number[];
    if (kind === "L") {
      const y0 = H * (0.04 + rand() * 0.92);
      p = [
        -30,
        y0,
        W * (0.12 + rand() * 0.2),
        y0 + gauss() * H * 0.03,
        t.x - W * (0.1 + rand() * 0.12),
        t.y + gauss() * H * 0.06,
        t.x,
        t.y,
      ];
    } else {
      const top = kind === "T";
      const x0 = W * rand() * 0.3;
      p = [
        x0,
        top ? -30 : H + 30,
        x0 + W * (0.18 + rand() * 0.2),
        top ? H * (-0.04 + rand() * 0.12) : H * (0.92 + rand() * 0.12),
        Math.min(gx, t.x - W * (0.12 + rand() * 0.08)),
        top ? t.y - H * (0.14 + rand() * 0.2) : t.y + H * (0.14 + rand() * 0.2),
        t.x,
        t.y,
      ];
    }
    threads.push({
      kind,
      node,
      x0: p[0],
      y0: p[1],
      c1x: p[2],
      c1y: p[3],
      c2x: p[4],
      c2y: p[5],
      x3: p[6],
      y3: p[7],
      len: bezLength(p),
      alpha: 0.16 + rand() * 0.3,
      width: 0.5 + rand() * 0.55,
      offset: rand(),
      speed: 0.05 + rand() * 0.07,
      sway: rand() * Math.PI * 2,
      delay: rand() * 0.25,
    });
  }
  const right = (top: boolean) =>
    nodes
      .map((n, i) => ({ n, i }))
      .filter(
        ({ n }) =>
          n.kind !== "anchor" &&
          n.x > core.x - core.rx * 0.2 &&
          (top ? n.y < core.y - core.ry * 0.45 : n.y > core.y + core.ry * 0.45)
      );
  const rightTop = right(true);
  const rightBot = right(false);
  for (let i = 0; i < exitCount; i++) {
    const top = i % 2 === 0;
    const src = top ? rightTop : rightBot;
    if (!src.length) continue;
    const { n: t, i: node } = src[Math.floor(rand() * src.length)];
    const sg = top ? -1 : 1;
    const p = [
      t.x,
      t.y,
      t.x + W * 0.012 + rand() * W * 0.02,
      t.y + sg * H * (0.1 + rand() * 0.08),
      t.x + W * (0.08 + rand() * 0.08),
      top ? H * (0.02 + rand() * 0.05) : H * (0.93 - rand() * 0.05),
      W + 40,
      top ? H * (0.02 + rand() * 0.09) : H * (0.89 + rand() * 0.09),
    ];
    threads.push({
      kind: "O",
      node,
      x0: p[0],
      y0: p[1],
      c1x: p[2],
      c1y: p[3],
      c2x: p[4],
      c2y: p[5],
      x3: p[6],
      y3: p[7],
      len: bezLength(p),
      alpha: 0.1 + rand() * 0.2,
      width: 0.5 + rand() * 0.5,
      offset: rand(),
      speed: 0.04 + rand() * 0.05,
      sway: rand() * 6,
      delay: 0.1 + rand() * 0.2,
    });
  }

  // Lines: each pill's agent to its anchor, real links, nearest neighbours,
  // a few long ones. Up to the budget.
  const edgeBudget = Math.max(0, budget - nodes.length - threads.length);
  const edges: MapEdge[] = [];
  const seen = new Set<number>();
  const push = (a: number, b: number, link = false) => {
    if (a === b || edges.length >= edgeBudget) return;
    const k = a < b ? a * 100000 + b : b * 100000 + a;
    if (seen.has(k)) return;
    seen.add(k);
    edges.push({
      a,
      b,
      phase: rand() * Math.PI * 2,
      rate: 0.6 + rand() * 1.2,
      sw: 0,
      sa: -1,
      d: 0,
      link,
    });
  };
  for (const p of pills) if (p.anchor >= 0) push(p.agent, p.anchor, true);
  for (const [a, b] of realLinks) push(a, b);
  const rank = (i: number) =>
    nodes[i].kind === "anchor" ? 0 : nodes[i].kind === "agent" ? 1 : 2;
  const visit = nodes.map((_, i) => i).sort((p, q) => rank(p) - rank(q));
  for (const i of visit) {
    const near = nearest(nodes, i, 11);
    const want =
      nodes[i].kind === "anchor" ? 4 : nodes[i].kind === "agent" ? 6 : 3;
    for (let m = 0; m < want && near.length; m++) {
      push(
        i,
        nodes[i].kind === "anchor"
          ? near[m]
          : near[Math.floor(rand() * near.length)]
      );
    }
  }
  for (let i = 0; i < nodes.length; i++) {
    if (rand() < 0.1) {
      const far = nearest(nodes, i, 24);
      const pick = far[12 + Math.floor(rand() * Math.max(1, far.length - 12))];
      if (pick !== undefined) push(i, pick);
    }
  }
  const adj: number[][] = nodes.map(() => []);
  edges.forEach((e, k) => {
    adj[e.a].push(k);
    adj[e.b].push(k);
  });

  // Status tint: how near each node is to an agent, fading with distance.
  const R = phone ? 55 : 88;
  const anchorOf = new Map(pills.map((p) => [p.anchor, p.agent]));
  nodes.forEach((n, ni) => {
    if (n.kind === "agent") {
      n.sw = 1;
      n.sa = ni;
      return;
    }
    // A pill's anchor takes its own agent's colour, not the nearest one's.
    const own = anchorOf.get(ni);
    if (own !== undefined) {
      n.sw = 0.6;
      n.sa = own;
      return;
    }
    let bd = Infinity;
    let bi = -1;
    for (const q of agents) {
      const dd = Math.hypot(nodes[q].x - n.x, nodes[q].y - n.y);
      if (dd < bd) {
        bd = dd;
        bi = q;
      }
    }
    n.sw = bi >= 0 ? clamp(1 - bd / R) : 0;
    n.sa = bi;
  });
  for (const e of edges) {
    const a = nodes[e.a];
    const b = nodes[e.b];
    e.sw = Math.max(a.sw, b.sw) * (e.link ? 1 : 0.85);
    e.sa = a.sw >= b.sw ? a.sa : b.sa;
    e.d = (a.d + b.d) / 2;
  }

  // Data riding in from the left: thumbnails in two lanes and a voice wave.
  const riders: MapRider[] = [];
  const perLane = phone ? 7 : 12;
  [0.4, 0.53].forEach((lane, li) => {
    for (let k = 0; k < perLane; k++)
      riders.push({
        kind: "thumb",
        type: (k * 3 + li * 2) % 6,
        lane: lane + (k % 2 ? 0.012 : -0.012),
        offset: k / perLane + li * 0.04,
        speed: 0.022 + li * 0.004,
      });
  });
  for (const o of [0, 0.5])
    riders.push({
      kind: "wave",
      type: 0,
      lane: 0.655,
      offset: o,
      speed: 0.018,
    });

  // Rows on the far left: the type of each real thing (task, event, mail,
  // doc, voice) and, for the owner only, its title.
  const rows: MapScene["rows"] = [];
  for (const item of input.items.slice(0, 24))
    rows.push({ type: "task", title: item.title });
  for (const t of input.threads.slice(0, 8))
    rows.push({ type: "mail", title: t.subject });
  for (const s of input.sources)
    rows.push({
      type:
        s.kind === "calendar"
          ? "event"
          : s.kind === "mail"
            ? "mail"
            : s.kind === "docs"
              ? "doc"
              : "task",
      title: s.label,
    });
  const fill = ["task", "event", "mail", "doc", "voice"];
  for (let i = 0; rows.length < 40; i++)
    rows.push({ type: fill[i % fill.length], title: null });
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }

  return {
    seed,
    phone,
    width: W,
    height: H,
    core,
    nodes,
    edges,
    adj,
    threads,
    riders,
    rows,
    agents,
    pills,
    stats: mapStats(input),
  };
}

/** The nearest `count` node indices to node `i`. */
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
  return best.map((b) => b[0]);
}

/** Nodes, lines and threads the canvas keeps on screen for this scene. */
export function sceneSize(scene: MapScene) {
  return scene.nodes.length + scene.edges.length + scene.threads.length;
}

/**
 * What a node says on hover. In presentation mode the owner's words go: a
 * task reads "Task", a thread "Thread"; agent names stay.
 */
/**
 * Where an agent's label goes: right of its node (x is that spot), or left
 * of it when the right side would overlap a result pill.
 */
export function labelX(
  x: number,
  y: number,
  size: { w: number; h: number },
  pills: readonly { x: number; y: number; w: number; h: number }[]
) {
  const M = 8;
  const hits = (lx: number) =>
    pills.some(
      (p) =>
        lx < p.x + p.w + M &&
        lx + size.w > p.x - M &&
        y < p.y + p.h + M &&
        y + size.h > p.y - M
    );
  if (!hits(x)) return x;
  // x is 14 px right of the node: the same gap on the left.
  const left = x - 28 - size.w;
  return hits(left) ? x : left;
}

export function nodeLabel(node: MapNode, presentation: boolean) {
  if (!node.real || !node.label) return null;
  if (!presentation || node.kind === "agent") return node.label;
  return node.kind === "thread" ? "Thread" : "Task";
}
