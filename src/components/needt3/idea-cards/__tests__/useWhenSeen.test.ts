/** @jest-environment jsdom */
import { act, createElement, createRef } from "react";

import { createRoot } from "react-dom/client";

import { useWhenSeen } from "../useWhenSeen";

type Entry = Pick<
  IntersectionObserverEntry,
  "isIntersecting" | "intersectionRatio"
>;

class FakeObserver {
  static all: FakeObserver[] = [];
  disconnected = false;
  constructor(public cb: (e: Entry[]) => void) {
    FakeObserver.all.push(this);
  }
  observe() {}
  disconnect() {
    this.disconnected = true;
  }
  see(ratio: number) {
    this.cb([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]);
  }
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

async function mount(onSeen: () => void, enabled = true) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  function Probe() {
    const ref = createRef<HTMLDivElement>();
    // the ref is filled by the time effects run
    const holder = { current: null as HTMLDivElement | null };
    useWhenSeen(holder, onSeen, { enabled });
    return createElement("div", {
      ref: (el: HTMLDivElement | null) => {
        holder.current = el;
        (ref as { current: HTMLDivElement | null }).current = el;
      },
    });
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(Probe));
  });
  return { unmount: () => act(() => root.unmount()) };
}

beforeEach(() => {
  FakeObserver.all = [];
  Object.assign(globalThis, { IntersectionObserver: FakeObserver });
  setVisibility("visible");
});

describe("useWhenSeen", () => {
  it("does nothing until the element is on screen", async () => {
    const seen = jest.fn();
    const { unmount } = await mount(seen);
    expect(seen).not.toHaveBeenCalled();
    act(() => FakeObserver.all[0].see(0.2));
    expect(seen).not.toHaveBeenCalled();
    await unmount();
  });

  it("fires once when enough of it is in view, then stops watching", async () => {
    const seen = jest.fn();
    const { unmount } = await mount(seen);
    act(() => FakeObserver.all[0].see(0.8));
    expect(seen).toHaveBeenCalledTimes(1);
    expect(FakeObserver.all[0].disconnected).toBe(true);
    await unmount();
  });

  it("waits for a hidden tab to be visible", async () => {
    setVisibility("hidden");
    const seen = jest.fn();
    const { unmount } = await mount(seen);
    act(() => FakeObserver.all[0].see(1));
    expect(seen).not.toHaveBeenCalled();
    act(() => setVisibility("visible"));
    expect(seen).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it("does not watch when disabled", async () => {
    const seen = jest.fn();
    const { unmount } = await mount(seen, false);
    expect(FakeObserver.all).toHaveLength(0);
    await unmount();
  });
});
