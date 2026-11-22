/**
 * @jest-environment jsdom
 *
 * A place switch shows its skeleton or nothing, never the Needt word: the word
 * is for a cold start, a new-version reload and the Budget frame.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { RouteLoading } from "../RouteLoading";

let path = "/tasks";
jest.mock("next/navigation", () => ({ usePathname: () => path }));
jest.mock("@/components/providers/MotionRuntime", () => ({
  useNeedtReducedMotion: () => false,
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});

describe("RouteLoading", () => {
  it("shows the place's skeleton, and never the word, however long it waits", () => {
    path = "/tasks";
    act(() => root.render(h(RouteLoading)));
    expect(host.querySelector(".st-route-loading")).not.toBeNull();
    expect(host.querySelector("[data-needt-loading]")).toBeNull();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(host.querySelector("[data-needt-loading]")).toBeNull();
  });

  it("draws nothing for a place that does not open", () => {
    path = "/settings";
    act(() => root.render(h(RouteLoading)));
    expect(host.innerHTML).toBe("");
  });
});
