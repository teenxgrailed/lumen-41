/**
 * @jest-environment jsdom
 *
 * The one completion every list shares: the strike at once, the fold after a
 * second when completed tasks are hidden, a row that stays when they are
 * kept, nothing animated under reduced motion, an Undo notice through the
 * notify facade, and a failed write taking the row's exit back.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { qk } from "@/lib/needt3/query-keys";

import {
  type Completion,
  FOLD_MS,
  STRIKE_HOLD_MS,
  useCompletion,
} from "../useCompletion";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let reduced = false;
jest.mock("@/components/providers/MotionRuntime", () => ({
  useNeedtReducedMotion: () => reduced,
}));
const success = jest.fn();
jest.mock("@/lib/notifications", () => ({
  notify: {
    success: (...a: unknown[]) => success(...a),
    error: jest.fn(),
  },
}));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let fetchMock: jest.Mock;
let latest: Completion;

let options: Parameters<typeof useCompletion>[0] = {};
function Probe() {
  latest = useCompletion(options);
  return null;
}

const list = (...done: boolean[]) =>
  done.map((d, i) => ({ id: "ab"[i], title: "T", done: d }));
const remote = (...done: boolean[]) =>
  act(() => {
    client.setQueryData(qk.tasks({}), list(...done));
    // the query client hands its notice to a zero-delay timer
    jest.advanceTimersByTime(1);
  });

const ok = () =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ id: "a", status: "completed" }),
  });

const view = (completed: string) =>
  client.setQueryData(qk.settings(), {
    theme: "light",
    defaultView: "week",
    timeZone: "UTC",
    weekStartDay: "monday",
    timeFormat: "24h",
    prefs: { taskView: { completed } },
  });

const task = { id: "a", title: "Write", done: false };
const tick = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

beforeEach(() => {
  jest.useFakeTimers();
  reduced = false;
  options = {};
  success.mockClear();
  fetchMock = jest.fn(ok);
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
  delete (globalThis as { fetch?: unknown }).fetch;
});

const mount = () =>
  act(() => {
    root.render(h(QueryClientProvider, { client }, h(Probe)));
  });

describe("useCompletion", () => {
  it("strikes at once and, with Completed: hide, folds after a second and is gone", async () => {
    view("hide");
    mount();
    act(() => latest.check(task));
    expect(latest.phase).toEqual({ a: "strike" });
    tick(STRIKE_HOLD_MS - 10);
    expect(latest.phase).toEqual({ a: "strike" });
    tick(20);
    expect(latest.phase).toEqual({ a: "collapse" });
    tick(FOLD_MS);
    expect(latest.phase).toEqual({});
    await flush();
  });

  it("writes first: one PUT goes out before the row has moved", async () => {
    view("hide");
    mount();
    act(() => latest.check(task));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/tasks/a");
    expect(init.method).toBe("PUT");
  });

  it.each(["today", "always"])(
    "with Completed: %s the row stays struck where it is",
    async (mode) => {
      view(mode);
      mount();
      act(() => latest.check(task));
      tick(STRIKE_HOLD_MS + FOLD_MS + 5000);
      expect(latest.phase).toEqual({ a: "strike" });
      await flush();
    }
  );

  it("under reduced motion there is no phase at all", async () => {
    reduced = true;
    view("hide");
    mount();
    act(() => latest.check(task));
    expect(latest.phase).toEqual({});
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("holds a ticked row as open while it plays, and only then", () => {
    view("hide");
    mount();
    const closed = { id: "a", done: true, title: "Write" };
    const other = { id: "b", done: true, title: "Other" };
    expect(latest.hold([closed, other])).toEqual([closed, other]);
    act(() => latest.check({ ...task }));
    const held = latest.hold([closed, other]);
    expect(held[0].done).toBe(false);
    expect(held[1]).toBe(other);
  });

  it("ignores a second tick on a row still on its way out", async () => {
    view("hide");
    mount();
    act(() => latest.check(task));
    act(() => latest.check(task));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tells the person through notify, with an Undo that puts the row back", async () => {
    view("always");
    mount();
    act(() => latest.check(task));
    await flush();
    expect(success).toHaveBeenCalledTimes(1);
    const [message, opts] = success.mock.calls[0];
    expect(message).toBe("Done · “Write”");
    expect(opts.action.label).toBe("Undo");
    await act(async () => {
      opts.action.onClick();
    });
    expect(latest.phase).toEqual({});
  });

  it("a closed row reopens at once, with no phase", async () => {
    view("hide");
    mount();
    act(() => latest.check({ ...task, done: true }));
    expect(latest.phase).toEqual({});
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(success.mock.calls[0][0]).toBe("Reopened “Write”");
  });

  it("a write that fails takes the exit back", async () => {
    view("always");
    fetchMock.mockImplementation(() => Promise.reject(new Error("down")));
    mount();
    act(() => latest.check(task));
    expect(latest.phase).toEqual({ a: "strike" });
    await flush();
    await flush();
    expect(latest.phase).toEqual({});
    expect(success).not.toHaveBeenCalled();
  });

  it("a row in an open-only list leaves after the strike even when completed tasks are kept", async () => {
    view("always");
    options = { leaves: (t) => t.id === "a" };
    mount();
    act(() => latest.check(task));
    expect(latest.phase).toEqual({ a: "strike" });
    expect(latest.departing).toEqual({ a: true });
    tick(STRIKE_HOLD_MS + 10);
    expect(latest.phase).toEqual({ a: "collapse" });
    tick(FOLD_MS);
    expect(latest.phase).toEqual({});
    expect(latest.departing).toEqual({});
    await flush();
  });

  it("a row that stays struck is not marked as departing", async () => {
    view("always");
    options = { leaves: () => false };
    mount();
    act(() => latest.check(task));
    expect(latest.departing).toEqual({});
    await flush();
  });

  it("Undo inside the window puts the row back for good", async () => {
    view("hide");
    mount();
    act(() => latest.check(task));
    await flush();
    tick(STRIKE_HOLD_MS + 10);
    expect(latest.phase).toEqual({ a: "collapse" });
    await act(async () => {
      success.mock.calls[0][1].action.onClick();
    });
    expect(latest.phase).toEqual({});
    tick(STRIKE_HOLD_MS + FOLD_MS + 100);
    expect(latest.phase).toEqual({});
  });

  describe("a task closed by another writer", () => {
    it("folds without the strike hold and is gone after the fold (Completed: hide)", () => {
      view("hide");
      mount();
      remote(false, false);
      expect(latest.phase).toEqual({});
      remote(true, false);
      expect(latest.phase).toEqual({ a: "collapse" });
      expect(latest.hold(list(true, false))[0].done).toBe(false);
      tick(FOLD_MS - 10);
      expect(latest.phase).toEqual({ a: "collapse" });
      tick(20);
      expect(latest.phase).toEqual({});
    });

    it("does nothing on the first read of the list", () => {
      view("hide");
      mount();
      remote(true, false);
      expect(latest.phase).toEqual({});
    });

    it("leaves a kept row alone unless the screen says it leaves", () => {
      view("always");
      mount();
      remote(false, false);
      remote(true, false);
      expect(latest.phase).toEqual({});
    });

    it("folds a kept row the screen says leaves", () => {
      view("always");
      options = { leaves: (t) => t.id === "b" };
      mount();
      remote(false, false);
      remote(true, true);
      expect(latest.phase).toEqual({ b: "collapse" });
    });

    it("is cancelled when it is reopened before the fold ends", () => {
      view("hide");
      mount();
      remote(false);
      remote(true);
      expect(latest.phase).toEqual({ a: "collapse" });
      remote(false);
      expect(latest.phase).toEqual({});
    });

    it("does not animate under reduced motion", () => {
      reduced = true;
      view("hide");
      mount();
      remote(false);
      remote(true);
      expect(latest.phase).toEqual({});
    });

    it("leaves a row this screen is already playing to its own timers", async () => {
      view("hide");
      mount();
      remote(false);
      act(() => latest.check(task));
      remote(true);
      expect(latest.phase).toEqual({ a: "strike" });
      await flush();
    });
  });
});
