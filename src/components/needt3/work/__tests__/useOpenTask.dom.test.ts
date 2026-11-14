/**
 * @jest-environment jsdom
 *
 * The open task window: deep link, close, reopen the same id from outside,
 * and a fresh mount. `useSearchParams` is mocked to read the live URL, which
 * is what Next's synced history gives after `history.replaceState`.
 */
import { createElement, useReducer } from "react";

import { type Root, createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

import { setOpenTask, useOpenTask } from "../taskParam";

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let seen: string | null = null;
let rerender: () => void = () => undefined;

function Probe() {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  rerender = tick;
  seen = useOpenTask();
  return null;
}

let root: Root | null = null;
let host: HTMLElement | null = null;
const mount = () => {
  host = document.createElement("div");
  root = createRoot(host);
  act(() => root!.render(createElement(Probe)));
};
const unmount = () => {
  act(() => root!.unmount());
  root = null;
};
/** Next syncing useSearchParams after a history write. */
const sync = () => act(() => rerender());

afterEach(() => {
  if (root) unmount();
  window.history.replaceState(null, "", "/tasks");
  setOpenTask(null);
});

describe("useOpenTask", () => {
  it("opens from a deep link", () => {
    window.history.replaceState(null, "", "/tasks?task=a");
    mount();
    expect(seen).toBe("a");
  });

  it("opens at once on setOpenTask, before the URL reaches the hook", () => {
    window.history.replaceState(null, "", "/tasks");
    mount();
    expect(seen).toBeNull();
    act(() => setOpenTask("b"));
    expect(seen).toBe("b");
    expect(window.location.search).toBe("?task=b");
  });

  it("closes", () => {
    window.history.replaceState(null, "", "/tasks?task=a");
    mount();
    act(() => setOpenTask(null));
    sync();
    expect(seen).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("opens A, closes, then A again from outside (sidebar, Composer)", () => {
    window.history.replaceState(null, "", "/tasks");
    mount();
    act(() => setOpenTask("a"));
    sync();
    act(() => setOpenTask(null));
    sync();
    expect(seen).toBeNull();
    // router.push(`/tasks?task=a`) from another screen
    window.history.pushState(null, "", "/tasks?task=a");
    sync();
    expect(seen).toBe("a");
  });

  it("a fresh mount starts from the URL, not from the last screen", () => {
    window.history.replaceState(null, "", "/tasks");
    mount();
    act(() => setOpenTask("a"));
    unmount();
    window.history.replaceState(null, "", "/tasks");
    mount();
    expect(seen).toBeNull();
  });
});
