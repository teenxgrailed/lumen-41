/**
 * @jest-environment jsdom
 *
 * The day plan hooks: with no plan for today a draft is asked for once; the
 * kill switch (404 disabled) sends the screen back to the old Today; closing
 * saves the evening note first and then closes with the resolutions, and a
 * 409 overflow comes back as a question instead of an error.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { ApiError } from "../core";
import {
  resetDayPlanOff,
  useCloseDay,
  useDayPlanToday,
  useRestoreSomeday,
} from "../day-plan";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = jest.fn();
const send = jest.fn();
jest.mock("../core", () => ({
  ...jest.requireActual("../core"),
  fetchJson: (...a: unknown[]) => fetchMock(...a),
  sendJson: (...a: unknown[]) => send(...a),
}));
const notifyError = jest.fn();
jest.mock("@/lib/notifications", () => ({
  notify: {
    error: (...a: unknown[]) => notifyError(...a),
    warning: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const emptySnapshot = {
  date: "2026-11-19",
  plan: null,
  settings: { taskLimit: 5 },
  needsDecision: [],
  limitSuggestion: null,
};
const drafted = { plan: { date: "2026-11-19", taskCount: 1, items: [] } };

let skip = false;
const api: {
  today?: ReturnType<typeof useDayPlanToday>;
  close?: ReturnType<typeof useCloseDay>;
  restore?: ReturnType<typeof useRestoreSomeday>;
} = {};
function Probe() {
  api.today = useDayPlanToday("2026-11-19", { skip });
  api.close = useCloseDay();
  api.restore = useRestoreSomeday();
  return null;
}

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const mount = async () => {
  client = new QueryClient();
  host = document.createElement("div");
  root = createRoot(host);
  await act(async () => {
    root.render(h(QueryClientProvider, { client }, h(Probe)));
  });
  // react-query notifies on a timer: let the query and the draft settle
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
};
beforeEach(() => {
  jest.clearAllMocks();
  resetDayPlanOff();
  skip = false;
  fetchMock.mockResolvedValue(emptySnapshot);
  send.mockResolvedValue(drafted);
});
afterEach(() => act(() => root.unmount()));

describe("today's plan", () => {
  it("asks for a draft once when there is no plan, and draws it when it comes", async () => {
    await mount();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("/api/day-plan/draft", "POST", {
      date: "2026-11-19",
    });
    expect(api.today?.snapshot?.plan).toEqual(drafted.plan);
  });

  it("neither reads nor drafts a plan on a screen that skips it (the phone Home)", async () => {
    skip = true;
    fetchMock.mockResolvedValue({ ...emptySnapshot, plan: drafted.plan });
    await mount();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(api.today?.off).toBe(true);
    expect(api.today?.snapshot).toBeUndefined();
  });

  it("leaves Today as it was when the day plan is switched off", async () => {
    send.mockRejectedValue(new ApiError(404, "disabled"));
    await mount();
    expect(api.today?.off).toBe(true);
    expect(api.today?.snapshot).toBeUndefined();
  });
});

describe("closing the day", () => {
  const body = {
    date: "2026-11-19",
    resolutions: [{ taskId: "a", resolution: "tomorrow" as const }],
  };

  it("saves the note as tomorrow's draft first, then closes", async () => {
    await mount();
    send.mockClear();
    send.mockResolvedValue({});
    let out: string | undefined;
    await act(async () => {
      out = await api.close?.close({
        body,
        tomorrow: "2026-11-20",
        note: " call the bank ",
      });
    });
    expect(out).toBe("closed");
    expect(send.mock.calls.map((c) => c[0])).toEqual([
      "/api/day-plan/draft",
      "/api/day-plan/close",
    ]);
    expect(send.mock.calls[0][2]).toEqual({
      date: "2026-11-20",
      note: "call the bank",
    });
    expect(send.mock.calls[1][2]).toEqual(body);
  });

  it("closes without a draft call when there is no note", async () => {
    await mount();
    send.mockClear();
    send.mockResolvedValue({});
    await act(async () => {
      await api.close?.close({ body, tomorrow: "2026-11-20", note: "  " });
    });
    expect(send.mock.calls.map((c) => c[0])).toEqual(["/api/day-plan/close"]);
  });

  it("brings an overflow back as a question and tells nobody it failed", async () => {
    await mount();
    send.mockClear();
    send.mockRejectedValue(new ApiError(409, "overflow"));
    let out: string | undefined;
    await act(async () => {
      out = await api.close?.close({ body, tomorrow: "2026-11-20", note: "" });
    });
    expect(out).toBe("overflow");
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("reports the kill switch so the old End day can run", async () => {
    await mount();
    send.mockClear();
    send.mockRejectedValue(new ApiError(404, "disabled"));
    let out: string | undefined;
    await act(async () => {
      out = await api.close?.close({ body, tomorrow: "2026-11-20", note: "" });
    });
    expect(out).toBe("off");
  });
});

describe("Someday", () => {
  it("returns tasks through the restore route", async () => {
    await mount();
    send.mockClear();
    send.mockResolvedValue({ restored: ["a"] });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await api.restore?.restore(["a"]);
    });
    expect(ok).toBe(true);
    expect(send).toHaveBeenCalledWith("/api/someday/restore", "POST", {
      taskIds: ["a"],
    });
  });
});
