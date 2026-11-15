/**
 * @jest-environment jsdom
 *
 * Keep for "tasks from earlier today": preview names only the missed ids (at
 * most 100), Keep applies the token and leaves a "Moved N tasks" notice with
 * Undo, Dismiss moves nothing, a plan with nothing to place says so, and any
 * failure (429, 409, 500) says "Could not..." and moves nothing.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { ApiError } from "../core";
import { useMissedKeep } from "../missed-keep";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const send = jest.fn();
jest.mock("../core", () => ({
  ...jest.requireActual("../core"),
  sendJson: (...a: unknown[]) => send(...a),
}));
const notice = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
};
jest.mock("@/lib/notifications", () => ({
  notify: {
    success: (...a: unknown[]) => notice.success(...a),
    error: (...a: unknown[]) => notice.error(...a),
    warning: (...a: unknown[]) => notice.warning(...a),
    info: (...a: unknown[]) => notice.info(...a),
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const change = (id: string) => ({
  taskId: id,
  title: `Task ${id}`,
  toStart: "2026-11-18T15:00:00.000Z",
  toEnd: "2026-11-18T15:30:00.000Z",
  explanation: "Missed at 08:30",
});
const PREVIEW = {
  previewToken: "p1",
  changes: [change("a"), change("b")],
  unscheduled: [{ taskId: "c", title: "Task c" }],
  skipped: [],
};

const api: { flow?: ReturnType<typeof useMissedKeep> } = {};
function Probe() {
  api.flow = useMissedKeep();
  return null;
}

let host: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  jest.clearAllMocks();
  send.mockReset();
  host = document.createElement("div");
  root = createRoot(host);
  await act(async () => {
    root.render(
      h(QueryClientProvider, { client: new QueryClient() }, h(Probe))
    );
  });
});
afterEach(() => {
  act(() => root.unmount());
});

const flow = () => api.flow!;
const calls = () => send.mock.calls.map((c) => c[2]);

describe("useMissedKeep", () => {
  it("previews only the ids it is given, at most 100", async () => {
    send.mockResolvedValueOnce(PREVIEW);
    await act(async () =>
      flow().preview(Array.from({ length: 120 }, (_, i) => `t${i}`))
    );
    expect(send.mock.calls[0][0]).toBe("/api/tasks/reschedule-preview");
    const body = calls()[0] as { action: string; taskIds: string[] };
    expect(body.action).toBe("preview");
    expect((body as { via?: string }).via).toBe("fill");
    expect(body.taskIds).toHaveLength(100);
    expect(flow().step).toMatchObject({
      kind: "preview",
      token: "p1",
      unscheduled: [{ taskId: "c" }],
    });
  });

  it("Keep applies the token and says Moved N tasks with an Undo that undoes", async () => {
    send
      .mockResolvedValueOnce(PREVIEW)
      .mockResolvedValueOnce({ undoToken: "u1" })
      .mockResolvedValueOnce({ changes: [] });
    await act(async () => flow().preview(["a", "b", "c"]));
    await act(async () => flow().keep());
    expect(calls()[1]).toEqual({ action: "apply", token: "p1", via: "fill" });
    expect(flow().step.kind).toBe("idle");
    const [text, opts] = notice.success.mock.calls[0];
    expect(text).toBe("Moved 2 tasks");
    expect(opts.action.label).toBe("Undo");
    await act(async () => opts.action.onClick());
    expect(calls()[2]).toEqual({ action: "undo", token: "u1", via: "fill" });
    expect(notice.success).toHaveBeenLastCalledWith("Put back");
  });

  it("Dismiss closes the preview without applying", async () => {
    send.mockResolvedValueOnce(PREVIEW);
    await act(async () => flow().preview(["a"]));
    act(() => flow().dismiss());
    expect(flow().step.kind).toBe("idle");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("nothing to place and nothing unplaced says so and shows no preview", async () => {
    send.mockResolvedValueOnce({
      previewToken: "p",
      changes: [],
      unscheduled: [],
      skipped: [{ taskId: "a" }],
    });
    await act(async () => flow().preview(["a"]));
    expect(flow().step.kind).toBe("idle");
    expect(notice.info).toHaveBeenCalledWith(
      "Nothing to move",
      expect.anything()
    );
  });

  it.each([429, 500])(
    "a %s on preview: Could not, nothing moves",
    async (code) => {
      send.mockRejectedValueOnce(new ApiError(code, "no"));
      await act(async () => flow().preview(["a"]));
      expect(flow().step.kind).toBe("idle");
      expect(String(notice.error.mock.calls[0][0])).toMatch(/^Could not/);
      expect(send).toHaveBeenCalledTimes(1);
    }
  );

  it("a failed Keep says Could not and never claims a move; a stale one asks again", async () => {
    send
      .mockResolvedValueOnce(PREVIEW)
      .mockRejectedValueOnce(new ApiError(500, "boom"));
    await act(async () => flow().preview(["a"]));
    await act(async () => flow().keep());
    expect(String(notice.error.mock.calls[0][0])).toMatch(/^Could not/);
    expect(notice.success).not.toHaveBeenCalled();
    expect(flow().step.kind).toBe("idle");

    send
      .mockResolvedValueOnce(PREVIEW)
      .mockRejectedValueOnce(new ApiError(409, "stale"));
    await act(async () => flow().preview(["a"]));
    await act(async () => flow().keep());
    expect(notice.warning).toHaveBeenCalledWith(
      "Your day changed",
      expect.anything()
    );
    expect(notice.success).not.toHaveBeenCalled();
  });
});
