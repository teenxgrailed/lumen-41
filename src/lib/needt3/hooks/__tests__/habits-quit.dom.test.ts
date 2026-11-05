/**
 * @jest-environment jsdom
 *
 * Event writes tell their own failures (review of #614, H1 and M8): on the
 * mutation, so a flow that closed before the write landed still hears it,
 * and a 403 refreshes the habits read that carries the gate.
 */
import { act, createElement as h, useEffect } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { qk } from "@/lib/needt3/query-keys";

import { ApiError } from "../core";
import { type LogEventVars, useLogHabitEvent } from "../habits-quit";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockSend = jest.fn();
jest.mock("../core", () => ({
  ...jest.requireActual("../core"),
  sendJson: (...a: unknown[]) => mockSend(...a),
}));
const mockInfo = jest.fn();
const mockError = jest.fn();
jest.mock("@/lib/notifications", () => ({
  notify: {
    info: (...a: unknown[]) => mockInfo(...a),
    error: (...a: unknown[]) => mockError(...a),
  },
}));
jest.mock("../habits", () => ({ useHabits: () => ({ data: [] }) }));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

/** Fires one write, then unmounts at once, as the pull flow does. */
async function writeAndLeave(vars: LogEventVars) {
  function Probe() {
    const log = useLogHabitEvent();
    useEffect(() => {
      log.mutate(vars);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }
  act(() => root.render(h(QueryClientProvider, { client }, h(Probe))));
  act(() => root.unmount());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  mockSend.mockReset();
  mockInfo.mockReset();
  mockError.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => host.remove());

it("tells a failed slip even after the flow has gone", async () => {
  mockSend.mockRejectedValue(new ApiError(500, "boom"));
  await writeAndLeave({ habitId: "q", type: "RELAPSE" });
  expect(mockError).toHaveBeenCalledWith(
    "Could not start again. Try once more."
  );
});

it("refreshes the gate and says what changed on a 403", async () => {
  mockSend.mockRejectedValue(new ApiError(403, "UPGRADE_REQUIRED"));
  const spy = jest.spyOn(client, "invalidateQueries");
  await writeAndLeave({ habitId: "q", type: "URGE" });
  expect(spy).toHaveBeenCalledWith({ queryKey: qk.habits() });
  expect(mockInfo).toHaveBeenCalledWith(
    "New pulls need Pro. What you logged stays readable."
  );
  expect(mockError).not.toHaveBeenCalled();
});
