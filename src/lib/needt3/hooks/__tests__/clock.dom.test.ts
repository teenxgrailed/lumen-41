/**
 * @jest-environment jsdom
 *
 * `useNow`: the day never stays on yesterday. An installed PWA is frozen in
 * the background and its timer does not run; on return any of visibilitychange,
 * pageshow, focus or online must read the clock again.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { useNow } from "../clock";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function Probe() {
  return h("span", { id: "now" }, useNow().toISOString());
}
const shown = () => host.querySelector("#now")!.textContent;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-16T20:00:00Z"));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(Probe)));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});

/** The device slept: the clock moved, no timer ran. */
const sleepUntil = (iso: string) => jest.setSystemTime(new Date(iso));

describe("useNow", () => {
  it("reads the time on mount", () => {
    expect(shown()).toBe("2026-10-16T20:00:00.000Z");
  });

  it("reads again each minute", () => {
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(shown()).toBe("2026-10-16T20:01:00.000Z");
  });

  it.each([
    [
      "visibilitychange",
      () => document.dispatchEvent(new Event("visibilitychange")),
    ],
    ["pageshow", () => window.dispatchEvent(new Event("pageshow"))],
    ["focus", () => window.dispatchEvent(new Event("focus"))],
    ["online", () => window.dispatchEvent(new Event("online"))],
  ])("catches up after sleep on %s", (_name, fire) => {
    sleepUntil("2026-10-17T10:56:00Z");
    expect(shown()).toBe("2026-10-16T20:00:00.000Z");
    act(() => {
      fire();
    });
    expect(shown()).toBe("2026-10-17T10:56:00.000Z");
  });

  it("stops listening when it unmounts", () => {
    const remove = jest.spyOn(window, "removeEventListener");
    act(() => root.unmount());
    expect(remove.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(["pageshow", "focus", "online"])
    );
    root = createRoot(host);
  });
});
