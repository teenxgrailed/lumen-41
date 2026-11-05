/**
 * @jest-environment jsdom
 *
 * The Map's drawing loop against a recording 2D context: it draws a whole
 * frame without throwing, in every mood, and keeps the draw calls per frame
 * bounded. The batching (one stroke per colour group, one fill per source) is
 * what keeps a 600-element scene cheap; this guards it.
 */
import { startLoop } from "../AgentsMap";
import { type MapInput, buildMapScene } from "../map-scene";

const NOW = Date.UTC(2026, 10, 5, 12);

function fakeContext() {
  const calls: Record<string, number> = {};
  const gradient = { addColorStop: () => undefined };
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_, key: string) {
      if (key in target) return target[key];
      if (key === "createRadialGradient" || key === "createLinearGradient")
        return () => gradient;
      return () => {
        calls[key] = (calls[key] ?? 0) + 1;
      };
    },
    set(_, key: string, value) {
      target[key] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const input: MapInput = {
  now: NOW,
  sources: [
    { id: "g", label: "Google Calendar", kind: "calendar" },
    { id: "m", label: "Gmail", kind: "mail" },
  ],
  agents: Array.from({ length: 5 }, (_, i) => ({
    id: `a${i}`,
    name: `Agent ${i}`,
    status: (["working", "waiting", "alert", "ok", "ok"] as const)[i],
    line: "All good",
    seen: i < 3,
  })),
  items: Array.from({ length: 60 }, (_, i) => ({
    id: `i${i}`,
    title: `Item ${i}`,
    status: i % 5 === 0 ? "done" : "in_progress",
    assigneeId: `a${i % 5}`,
    related: [`i${(i + 1) % 60}`],
    updatedAt: new Date(NOW - i * 3_600_000).toISOString(),
    result: null,
  })),
  threads: [],
};

beforeAll(() => {
  // jsdom has no Path2D; the loop only builds and strokes them.
  (globalThis as { Path2D?: unknown }).Path2D = class {
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
  };
  // A glow sprite is a canvas too; give it a context that records nothing.
  HTMLCanvasElement.prototype.getContext = (() =>
    fakeContext().ctx) as unknown as HTMLCanvasElement["getContext"];
});

describe("Map drawing loop", () => {
  it("draws a frame in batches, well under one call per element", () => {
    const scene = buildMapScene(input, 7, 1200, 620);
    const { ctx, calls } = fakeContext();
    const live = {
      hover: -1,
      pointer: null,
      moved: false,
      presentation: false,
    };
    const loop = startLoop(ctx, scene, 2, live, {
      onHover: () => undefined,
    });
    loop.pause();
    const strokes = calls.stroke ?? 0;
    const fills = calls.fill ?? 0;
    const stamps = calls.drawImage ?? 0;
    // The first frame: the threads are still drawing in; lines and threads
    // are batched, nodes are one fill each, glows one stamp each.
    // Threads still drawing in stroke alone on the first frame; the lines
    // are a few batched paths.
    expect(strokes).toBeLessThan(scene.threads.length + 60);
    expect(fills).toBeLessThanOrEqual(scene.nodes.length + 40);
    expect(stamps).toBeLessThanOrEqual(
      scene.nodes.length + scene.riders.length + 40
    );
  });

  it("finds the node under the pointer and reports it once a frame", () => {
    // A still frame (reduced motion): no drift, the entry already done.
    const media = window.matchMedia;
    window.matchMedia = (() => ({ matches: true })) as never;
    const scene = buildMapScene(input, 9, 1200, 620);
    const { ctx } = fakeContext();
    const agent = scene.nodes[scene.agents[0]];
    const live = {
      hover: -1,
      pointer: { x: agent.x, y: agent.y },
      moved: true,
      presentation: false,
    };
    const seen: number[] = [];
    const loop = startLoop(ctx, scene, 1, live, {
      onHover: (i) => seen.push(i),
    });
    loop.pause();
    window.matchMedia = media;
    expect(seen).toEqual([scene.agents[0]]);
    expect(live.hover).toBe(scene.agents[0]);
  });

  it("draws the phone scene", () => {
    const scene = buildMapScene(input, 3, 390, 640);
    const { ctx, calls } = fakeContext();
    // After the entry: the live layer (agents' rings) strokes on the canvas.
    const loop = startLoop(
      ctx,
      scene,
      2,
      { hover: -1, pointer: null, moved: false, presentation: false },
      { onHover: () => undefined },
      { born: performance.now() - 60_000, mood: 0, moodAt: performance.now() }
    );
    loop.pause();
    expect(calls.stroke ?? 0).toBeGreaterThan(0);
  });

  it("finds the node under a tap, with no pointermove before it", () => {
    const media = window.matchMedia;
    window.matchMedia = (() => ({ matches: true })) as never;
    const scene = buildMapScene(input, 11, 390, 640);
    const { ctx } = fakeContext();
    const live = {
      hover: -1,
      pointer: null,
      moved: false,
      presentation: false,
    };
    const loop = startLoop(ctx, scene, 1, live, {
      onHover: () => undefined,
    });
    loop.pause();
    const i = scene.agents[1];
    const { dx, dy } = loop.drift();
    expect(loop.hitAt(scene.nodes[i].x + dx, scene.nodes[i].y + dy)).toBe(i);
    window.matchMedia = media;
    expect(live.hover).toBe(-1);
  });

  it("keeps its clock across a rebuild of the same layout", () => {
    const scene = buildMapScene(input, 5, 1200, 620);
    const clock = {
      born: performance.now() - 60_000,
      mood: 2,
      moodAt: performance.now(),
    };
    const loop = startLoop(
      fakeContext().ctx,
      scene,
      1,
      { hover: -1, pointer: null, moved: false, presentation: false },
      { onHover: () => undefined },
      clock
    );
    loop.pause();
    // A minute in, the entry is over and the mood is still the one it had.
    expect(clock.mood).toBe(2);
  });

  it("steps the resolution down when frames run long, without a rebuild", () => {
    const scene = buildMapScene(input, 5, 1200, 620);
    const { ctx } = fakeContext();
    const canvas = { width: 2400, height: 1240 };
    Object.defineProperty(ctx, "canvas", { value: canvas });
    let queued: ((t: number) => void) | null = null;
    const raf = jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        queued = cb;
        return 1;
      });
    // Every frame "takes" 30 ms.
    let clockMs = 0;
    const now = jest
      .spyOn(performance, "now")
      .mockImplementation(() => (clockMs += 30));
    const loop = startLoop(
      ctx,
      scene,
      2,
      { hover: -1, pointer: null, moved: false, presentation: false },
      { onHover: () => undefined }
    );
    loop.run();
    for (let f = 1; f <= 120 && queued; f++) {
      const cb: (t: number) => void = queued;
      queued = null;
      cb(f * 40);
    }
    loop.pause();
    raf.mockRestore();
    now.mockRestore();
    const q = loop.quality();
    expect(q.dpr).toBeLessThan(2);
    expect(canvas.width).toBe(Math.round(1200 * q.dpr));
  });

  it("steps down when frames land late although the script is fast", () => {
    const scene = buildMapScene(input, 5, 1200, 620);
    const { ctx } = fakeContext();
    const canvas = { width: 1200, height: 620 };
    Object.defineProperty(ctx, "canvas", { value: canvas });
    let queued: ((t: number) => void) | null = null;
    const raf = jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        queued = cb;
        return 1;
      });
    // The script takes 1 ms, but frames arrive every 66 ms (raster bound).
    let clockMs = 0;
    const now = jest
      .spyOn(performance, "now")
      .mockImplementation(() => (clockMs += 0.5));
    const loop = startLoop(
      ctx,
      scene,
      1,
      { hover: -1, pointer: null, moved: false, presentation: false },
      { onHover: () => undefined }
    );
    loop.run();
    for (let f = 1; f <= 60 && queued; f++) {
      const cb: (t: number) => void = queued;
      queued = null;
      cb(f * 66);
    }
    loop.pause();
    raf.mockRestore();
    now.mockRestore();
    expect(loop.quality().lite).toBe(true);
    expect(loop.quality().dpr).toBeLessThan(1);
    expect(canvas.width).toBe(Math.round(1200 * loop.quality().dpr));
  });

  it("repaints the cached layers on their beat, not every frame", () => {
    const layerCalls: Record<string, number>[] = [];
    const prev = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => {
      const f = fakeContext();
      layerCalls.push(f.calls);
      return f.ctx;
    }) as unknown as HTMLCanvasElement["getContext"];
    const scene = buildMapScene(input, 5, 1200, 620);
    const { ctx } = fakeContext();
    Object.defineProperty(ctx, "canvas", {
      value: { width: 1200, height: 620 },
    });
    let queued: ((t: number) => void) | null = null;
    const raf = jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        queued = cb;
        return 1;
      });
    const t0 = performance.now();
    const loop = startLoop(
      ctx,
      scene,
      1,
      { hover: -1, pointer: null, moved: false, presentation: false },
      { onHover: () => undefined },
      { born: t0 - 60_000, mood: 0, moodAt: t0 }
    );
    const painted = () =>
      layerCalls.reduce((sum, c) => sum + (c.fillRect ?? 0), 0);
    const before = painted();
    loop.run();
    // 30 frames over one second.
    for (let f = 1; f <= 30 && queued; f++) {
      const cb: (t: number) => void = queued;
      queued = null;
      cb(t0 + f * 34);
    }
    loop.pause();
    raf.mockRestore();
    HTMLCanvasElement.prototype.getContext = prev;
    // A base repaint makes three fills (night, core glow, wash): two or
    // three repaints in a second, not thirty.
    expect(painted() - before).toBeGreaterThan(0);
    expect(painted() - before).toBeLessThanOrEqual(9);
  });
});
