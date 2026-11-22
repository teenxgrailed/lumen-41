/**
 * @jest-environment jsdom
 *
 * The shared "is anybody looking" state: active while the tab is visible and
 * the page has been touched within REST_MS; hidden or untouched means not
 * active, the root carries data-needt-idle, and the listeners exist only
 * while someone subscribes.
 */
import { act } from "react";

import { REST_MS } from "@/components/needt3/scenes/sky-rest";

import {
  IDLE_ATTRIBUTE,
  getPageActivity,
  onPageActive,
  subscribePageActivity,
  visibleInterval,
} from "../page-activity";

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

const root = () => document.documentElement;

describe("page activity", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setHidden(false);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts active and goes idle after REST_MS without input", () => {
    const seen: boolean[] = [];
    const off = onPageActive((a) => seen.push(a));
    expect(seen).toEqual([true]);
    expect(root().hasAttribute(IDLE_ATTRIBUTE)).toBe(false);

    act(() => {
      jest.advanceTimersByTime(REST_MS + 200);
    });
    expect(getPageActivity()).toEqual({
      visible: true,
      idle: true,
      active: false,
    });
    expect(root().getAttribute(IDLE_ATTRIBUTE)).toBe("idle");
    expect(seen).toEqual([true, false]);
    off();
  });

  it("wakes on input and goes idle again after another REST_MS", () => {
    const seen: boolean[] = [];
    const off = onPageActive((a) => seen.push(a));
    act(() => {
      jest.advanceTimersByTime(REST_MS + 200);
    });
    act(() => {
      window.dispatchEvent(new Event("pointermove"));
    });
    expect(getPageActivity().active).toBe(true);
    expect(root().hasAttribute(IDLE_ATTRIBUTE)).toBe(false);
    act(() => {
      jest.advanceTimersByTime(REST_MS + 200);
    });
    expect(getPageActivity().active).toBe(false);
    expect(seen).toEqual([true, false, true, false]);
    off();
  });

  it("input keeps it awake", () => {
    const off = onPageActive(() => undefined);
    for (let i = 0; i < 5; i += 1) {
      act(() => {
        jest.advanceTimersByTime(REST_MS - 2000);
        window.dispatchEvent(new Event("keydown"));
      });
    }
    expect(getPageActivity().active).toBe(true);
    off();
  });

  it("a hidden tab is not active and says so on the root", () => {
    const off = onPageActive(() => undefined);
    act(() => setHidden(true));
    expect(getPageActivity()).toMatchObject({ visible: false, active: false });
    expect(root().getAttribute(IDLE_ATTRIBUTE)).toBe("hidden");
    act(() => setHidden(false));
    expect(getPageActivity().active).toBe(true);
    expect(root().hasAttribute(IDLE_ATTRIBUTE)).toBe(false);
    off();
  });

  describe("visibleInterval", () => {
    it("ticks while visible, stops while hidden, reads once on return", () => {
      const fn = jest.fn();
      const stop = visibleInterval(fn, 1000);
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      expect(fn).toHaveBeenCalledTimes(3);

      act(() => setHidden(true));
      act(() => {
        jest.advanceTimersByTime(10_000);
      });
      expect(fn).toHaveBeenCalledTimes(3);
      expect(jest.getTimerCount()).toBe(0);

      act(() => setHidden(false));
      expect(fn).toHaveBeenCalledTimes(4);
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(fn).toHaveBeenCalledTimes(6);

      stop();
      expect(jest.getTimerCount()).toBe(0);
      act(() => setHidden(true));
      act(() => setHidden(false));
      expect(fn).toHaveBeenCalledTimes(6);
    });

    it("keeps ticking when visible but idle (a timer being watched)", () => {
      const fn = jest.fn();
      const off = onPageActive(() => undefined);
      const stop = visibleInterval(fn, 1000);
      act(() => {
        jest.advanceTimersByTime(REST_MS + 3000);
      });
      expect(getPageActivity().active).toBe(false);
      expect(fn.mock.calls.length).toBeGreaterThanOrEqual(REST_MS / 1000);
      stop();
      off();
    });
  });

  it("holds no listeners and no attribute once the last subscriber leaves", () => {
    const add = jest.spyOn(window, "addEventListener");
    const remove = jest.spyOn(window, "removeEventListener");
    const a = subscribePageActivity(() => undefined);
    const b = subscribePageActivity(() => undefined);
    act(() => setHidden(true));
    expect(root().hasAttribute(IDLE_ATTRIBUTE)).toBe(true);
    const added = add.mock.calls.length;
    expect(added).toBeGreaterThan(0);
    a();
    expect(remove).not.toHaveBeenCalled();
    b();
    expect(remove.mock.calls.length).toBe(added);
    expect(root().hasAttribute(IDLE_ATTRIBUTE)).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
    // a second round does not stack listeners
    const c = subscribePageActivity(() => undefined);
    c();
    expect(remove.mock.calls.length).toBe(added * 2);
    add.mockRestore();
    remove.mockRestore();
  });
});
