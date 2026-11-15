/**
 * @jest-environment jsdom
 *
 * The first-replan flow: a proposed move is only offered when the task lands
 * after the meeting and after now; Keep slides the row and only then lets the
 * other hints (sample-day note, suggested highlight) appear; Not now and Skip
 * release them at once; Skip is the one removal that is counted as skipping.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import type { FirstReplanState } from "@/lib/onboarding/first-replan";

import { useFirstReplanGate } from "@/store/first-replan";

import { useFirstReplan, useFirstReplanHold } from "../first-replan";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const send = jest.fn();
let demoReply: { demo: FirstReplanState | null } = { demo: null };
jest.mock("../core", () => ({
  ...jest.requireActual("../core"),
  sendJson: (...a: unknown[]) => send(...a),
  fetchJson: async () => demoReply,
}));
const mockWarn = jest.fn();
const mockError = jest.fn();
jest.mock("@/lib/notifications", () => ({
  notify: {
    error: (...a: unknown[]) => mockError(...a),
    warning: (...a: unknown[]) => mockWarn(...a),
    success: jest.fn(),
    info: jest.fn(),
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
const flipRow = jest.fn();
const reduced = { on: false };
jest.mock("@/lib/needt3/row-flip", () => ({
  ROW_FLIP_MS: 220,
  measureRow: () => 120,
  flipRow: (...a: unknown[]) => flipRow(...a),
  prefersReducedMotion: () => reduced.on,
}));

const demo: FirstReplanState = {
  conflict: true,
  task: {
    id: "task",
    title: "Demo: write the weekly plan",
    start: "2026-11-18T10:30:00.000Z",
    end: "2026-11-18T11:30:00.000Z",
  },
  meeting: {
    id: "meeting",
    title: "Demo: sync with Alex",
    start: "2026-11-18T10:45:00.000Z",
    end: "2026-11-18T11:30:00.000Z",
  },
};

const api: {
  flow?: ReturnType<typeof useFirstReplan>;
  hold?: boolean;
} = {};
function Probe() {
  api.flow = useFirstReplan(demo);
  api.hold = useFirstReplanHold();
  return null;
}

let host: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  jest.useFakeTimers({
    now: new Date("2026-11-18T10:00:00Z"),
    doNotFake: ["nextTick", "setImmediate", "queueMicrotask"],
  });
  jest.clearAllMocks();
  reduced.on = false;
  demoReply = { demo };
  useFirstReplanGate.getState().reset();
  window.requestAnimationFrame = (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(0), 0) as unknown as number;
  const client = new QueryClient();
  host = document.createElement("div");
  root = createRoot(host);
  await act(async () => {
    root.render(h(QueryClientProvider, { client }, h(Probe)));
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(10);
  });
});
afterEach(() => {
  jest.useRealTimers();
  act(() => root.unmount());
});

const preview = (toStart: string | null) =>
  send.mockResolvedValueOnce({
    previewToken: "tok",
    changes: toStart
      ? [
          {
            taskId: "task",
            toStart,
            toEnd: "2026-11-18T13:30:00.000Z",
          },
        ]
      : [],
  });

it("holds the other hints while the demo overlaps and nothing is answered", () => {
  expect(api.hold).toBe(true);
});

it("offers a move that lands after the meeting and after now", async () => {
  preview("2026-11-18T11:45:00.000Z");
  await act(async () => {
    await api.flow!.replan();
  });
  expect(api.flow!.step).toMatchObject({
    kind: "preview",
    to: { start: "2026-11-18T11:45:00.000Z" },
  });
});

it("refuses a move to before the meeting ends, and nothing is kept", async () => {
  // 10:15 is later than now (10:00) but before the meeting (10:45 to 11:30).
  preview("2026-11-18T10:15:00.000Z");
  await act(async () => {
    await api.flow!.replan();
  });
  expect(api.flow!.step).toEqual({ kind: "idle" });
  expect(mockError).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledTimes(1);
});

it("refuses a move into the past", async () => {
  jest.setSystemTime(new Date("2026-11-18T12:00:00Z"));
  preview("2026-11-18T11:45:00.000Z");
  await act(async () => {
    await api.flow!.replan();
  });
  expect(api.flow!.step).toEqual({ kind: "idle" });
  expect(mockError).toHaveBeenCalledTimes(1);
});

it("on Keep slides the row, then lets the other hints in", async () => {
  preview("2026-11-18T11:45:00.000Z");
  await act(async () => {
    await api.flow!.replan();
  });
  flipRow.mockReturnValue(true);
  send.mockResolvedValueOnce({ undoToken: "undo" });
  await act(async () => {
    const kept = api.flow!.keep("tok");
    await jest.advanceTimersByTimeAsync(10);
    await kept;
  });
  expect(flipRow).toHaveBeenCalledWith("task", 120);
  expect(api.flow!.step).toEqual({ kind: "kept", undoToken: "undo" });
  // The row is still on its way: the hints keep waiting, even though the
  // demo no longer overlaps.
  expect(api.hold).toBe(true);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(260);
  });
  expect(api.hold).toBe(false);
});

it("with reduced motion nothing is animated and the hints come at once", async () => {
  reduced.on = true;
  preview("2026-11-18T11:45:00.000Z");
  await act(async () => {
    await api.flow!.replan();
  });
  flipRow.mockReturnValue(false);
  send.mockResolvedValueOnce({ undoToken: "undo" });
  await act(async () => {
    const kept = api.flow!.keep("tok");
    await jest.advanceTimersByTimeAsync(10);
    await kept;
  });
  expect(api.hold).toBe(false);
});

it("Not now lets the other hints in", async () => {
  await act(async () => api.flow!.notNow());
  expect(api.hold).toBe(false);
});

it("Skip removes the demo, is counted as a skip, and lets the hints in", async () => {
  send.mockResolvedValueOnce({ removed: 2 });
  await act(async () => {
    await api.flow!.remove("skip");
  });
  expect(send).toHaveBeenCalledWith(
    "/api/onboarding/first-replan?reason=skip",
    "DELETE"
  );
  expect(api.hold).toBe(false);
});

it("removing the demo after Keep is not a skip", async () => {
  send.mockResolvedValueOnce({ removed: 2 });
  await act(async () => {
    await api.flow!.remove();
  });
  expect(send).toHaveBeenCalledWith("/api/onboarding/first-replan", "DELETE");
});
