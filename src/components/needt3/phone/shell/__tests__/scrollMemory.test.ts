/**
 * @jest-environment jsdom
 */
import {
  SCROLL_POP_WINDOW_MS,
  SCROLL_RESTORE_MS,
  scrollMemoryReset,
  scrollNotePop,
  scrollNotePush,
  scrollPopRecent,
  scrollRecall,
  scrollRemember,
  scrollRestore,
  scrollTakePop,
} from "../scrollMemory";

describe("the remembered offset", () => {
  beforeEach(scrollMemoryReset);

  it("is per path, rounded, never negative, and 0 for a path never seen", () => {
    scrollRemember("/tasks", 412.6);
    scrollRemember("/today", -30);
    expect(scrollRecall("/tasks")).toBe(413);
    expect(scrollRecall("/today")).toBe(0);
    expect(scrollRecall("/never")).toBe(0);
  });
});

describe("what counts as a Back", () => {
  beforeEach(scrollMemoryReset);

  it("is a popstate that is recent, and is used up by the route change", () => {
    scrollNotePop(1000);
    expect(scrollPopRecent(1000 + SCROLL_POP_WINDOW_MS - 1)).toBe(true);
    expect(scrollTakePop(1500)).toBe(true);
    expect(scrollTakePop(1600)).toBe(false);
  });

  it("expires, so a popstate that changed no path cannot restore a later forward tap", () => {
    scrollNotePop(1000);
    expect(scrollTakePop(1000 + SCROLL_POP_WINDOW_MS + 1)).toBe(false);
  });

  it("is cancelled by a tap on a link or the dock", () => {
    scrollNotePop(1000);
    scrollNotePush();
    expect(scrollTakePop(1100)).toBe(false);
  });
});

describe("restoring the offset", () => {
  let frames: Array<() => void>;
  let max: number;
  let now: number;
  const scrollTo = jest.fn();

  beforeEach(() => {
    frames = [];
    max = 0;
    now = 0;
    scrollTo.mockClear();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    jest.spyOn(performance, "now").mockImplementation(() => now);
    jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        frames.push(() => cb(now));
        return frames.length;
      });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
      frames = [];
    });
    Object.defineProperty(window, "innerHeight", {
      value: 800,
      configurable: true,
    });
    Object.defineProperty(document.documentElement, "scrollHeight", {
      get: () => 800 + max,
      configurable: true,
    });
  });
  afterEach(() => jest.restoreAllMocks());

  const step = (ms = 16) => {
    now += ms;
    const run = frames;
    frames = [];
    run.forEach((f) => f());
  };

  it("goes straight to the top for 0 and asks for nothing more", () => {
    scrollRestore(0);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    expect(frames).toHaveLength(0);
  });

  it("keeps asking each frame until the page is tall enough, then stops", () => {
    scrollRestore(900);
    max = 200; // the skeleton: shorter than the offset
    step();
    expect(scrollTo).toHaveBeenLastCalledWith(0, 200);
    expect(frames).toHaveLength(1);
    max = 1500; // the page has streamed in
    step();
    expect(scrollTo).toHaveBeenLastCalledWith(0, 900);
    expect(frames).toHaveLength(0);
  });

  it("gives up when the page never gets tall enough", () => {
    scrollRestore(900);
    max = 100;
    step(SCROLL_RESTORE_MS + 50);
    expect(frames).toHaveLength(0);
  });

  it("lets go the moment a finger lands", () => {
    scrollRestore(900);
    max = 100;
    step();
    window.dispatchEvent(new Event("touchstart"));
    scrollTo.mockClear();
    step();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("can be cancelled by the next route change", () => {
    const stop = scrollRestore(900);
    stop();
    scrollTo.mockClear();
    step();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
