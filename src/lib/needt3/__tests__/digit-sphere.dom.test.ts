/**
 * @jest-environment jsdom
 *
 * prefers-reduced-motion: one still frame, no rAF scheduled. And the normal
 * path: it does schedule, stop() cancels, and a hidden tab schedules nothing.
 */
import { startDigitSphere } from "../digit-sphere";

function fakeCanvas() {
  const calls = { draw: 0 };
  const g = {
    setTransform: jest.fn(),
    clearRect: jest.fn(),
    drawImage: jest.fn(() => calls.draw++),
    fillText: jest.fn(),
    fillStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    globalAlpha: 1,
  };
  (
    HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }
  ).getContext = () => g;
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "clientWidth", { value: 1000 });
  Object.defineProperty(canvas, "clientHeight", { value: 700 });
  document.body.appendChild(canvas);
  return { canvas, calls };
}

function motion(reduce: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: reduce && q.includes("reduce"),
    media: q,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })) as unknown as typeof window.matchMedia;
}

function hidden(value: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => value,
  });
}

describe("startDigitSphere", () => {
  let raf: jest.SpyInstance;
  let caf: jest.SpyInstance;
  beforeEach(() => {
    raf = jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(() => 1);
    caf = jest.spyOn(window, "cancelAnimationFrame").mockImplementation();
    hidden(false);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("reduced motion draws once and never schedules a frame", () => {
    motion(true);
    const { canvas, calls } = fakeCanvas();
    const h = startDigitSphere(canvas);
    expect(calls.draw).toBeGreaterThan(0);
    expect(raf).not.toHaveBeenCalled();
    h.stop();
    expect(raf).not.toHaveBeenCalled();
  });

  it("the reducedMotion option alone is enough", () => {
    motion(false);
    const { canvas, calls } = fakeCanvas();
    startDigitSphere(canvas, { reducedMotion: true }).stop();
    expect(calls.draw).toBeGreaterThan(0);
    expect(raf).not.toHaveBeenCalled();
  });

  it("with motion allowed it schedules a frame, and stop cancels it", () => {
    motion(false);
    const { canvas } = fakeCanvas();
    const h = startDigitSphere(canvas);
    expect(raf).toHaveBeenCalledTimes(1);
    h.stop();
    expect(caf).toHaveBeenCalled();
  });

  it("does not schedule while the tab is hidden", () => {
    motion(false);
    hidden(true);
    const { canvas } = fakeCanvas();
    startDigitSphere(canvas).stop();
    expect(raf).not.toHaveBeenCalled();
  });
});
