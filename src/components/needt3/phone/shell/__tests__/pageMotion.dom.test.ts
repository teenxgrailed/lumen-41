/**
 * @jest-environment jsdom
 *
 * The page change's script: a still copy of the page is kept at the tap, put
 * under the new page when the place changes, released when the new page has
 * played, and never made when there is nothing to show or motion is off.
 */
import {
  GHOST_MAX_NODES,
  GHOST_TTL_MS,
  GHOST_WAIT_MS,
  pageMotionCapture,
  pageMotionCaptureIfNone,
  pageMotionDiscard,
  pageMotionNotePop,
  pageMotionReset,
  pageMotionRun,
} from "../pageMotion";

const host = () => document.querySelector<HTMLElement>("[data-v2p-host]")!;
const stage = () => host().querySelector<HTMLElement>(".v2p-stage")!;
const ghost = () => host().querySelector<HTMLElement>(".pk-pg-ghost");

function mount(extra = "") {
  document.body.innerHTML = `
    <main data-v2p-host>
      <div class="v2p-stage">
        <div class="pk-screen">
          <div class="pk-scroll"><p id="title">Home</p><canvas width="4" height="4"></canvas>${extra}</div>
          <div class="pk-fog" id="fog"></div>
        </div>
      </div>
    </main>`;
}

function animEvent(type: string, animationName: string) {
  const e = new Event(type, { bubbles: true });
  Object.defineProperty(e, "animationName", { value: animationName });
  stage().dispatchEvent(e);
}

function reduced(on: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: on && q.includes("reduce"),
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

const drawImage = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  drawImage.mockClear();
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    drawImage,
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  document.documentElement.removeAttribute("data-animations");
  reduced(false);
  mount();
});
afterEach(() => {
  pageMotionReset();
  jest.useRealTimers();
  document.body.innerHTML = "";
});

describe("the still copy", () => {
  it("is taken without the fog, the sheets or any id, and sits under the stage", () => {
    pageMotionCapture();
    pageMotionRun("forward");
    expect(stage().getAttribute("data-pg")).toBe("forward");
    const g = ghost()!;
    expect(g).not.toBeNull();
    expect(g.getAttribute("data-pg")).toBe("forward");
    expect(g.getAttribute("aria-hidden")).toBe("true");
    expect(g.hasAttribute("inert")).toBe(true);
    expect(g.querySelector("#title")).toBeNull();
    expect(g.textContent).toContain("Home");
    expect(g.querySelector(".pk-fog")).toBeNull();
    // the live fog is untouched
    expect(document.querySelector("#fog")).not.toBeNull();
    expect(g.parentElement).toBe(host());
  });

  it("carries a canvas's pixels, which a clone leaves blank", () => {
    pageMotionCapture();
    expect(drawImage).toHaveBeenCalledTimes(1);
  });

  it("is offset by the scroll position it was taken at", () => {
    Object.defineProperty(window, "scrollY", {
      value: 420,
      configurable: true,
    });
    pageMotionCapture();
    pageMotionRun("rise");
    expect(ghost()!.querySelector<HTMLElement>(".pk-pg-sheet")!.style.top).toBe(
      "-420px"
    );
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  it("gives way only when the new page starts, and goes when it ends", () => {
    pageMotionCapture();
    pageMotionRun("back");
    expect(ghost()!.hasAttribute("data-pg-go")).toBe(false);
    animEvent("animationstart", "v3-pg-in-back");
    expect(ghost()!.hasAttribute("data-pg-go")).toBe(true);
    // the wait for a slow page no longer applies
    jest.advanceTimersByTime(GHOST_WAIT_MS + 50);
    expect(ghost()).not.toBeNull();
    animEvent("animationend", "v3-pg-in-back");
    expect(ghost()).toBeNull();
    expect(stage().hasAttribute("data-pg")).toBe(false);
  });

  it("ignores animations that are not the page's", () => {
    pageMotionCapture();
    pageMotionRun("forward");
    animEvent("animationstart", "v3-route-loading-in");
    animEvent("animationend", "v3-route-loading-in");
    expect(ghost()).not.toBeNull();
    expect(stage().getAttribute("data-pg")).toBe("forward");
  });

  it("is let go when the new page is slow, so the loading state shows", () => {
    pageMotionCapture();
    pageMotionRun("forward");
    jest.advanceTimersByTime(GHOST_WAIT_MS + 1);
    expect(ghost()).toBeNull();
    // the stage still asks for the motion when the page does arrive
    expect(stage().getAttribute("data-pg")).toBe("forward");
  });

  it("is forgotten when no place ever changed", () => {
    pageMotionCapture();
    jest.advanceTimersByTime(GHOST_TTL_MS + 1);
    pageMotionRun("forward");
    expect(ghost()).toBeNull();
    expect(stage().getAttribute("data-pg")).toBe("rise");
  });

  it("is dropped by a discard (Back, Forward)", () => {
    pageMotionCapture();
    pageMotionDiscard();
    pageMotionRun("forward");
    expect(ghost()).toBeNull();
  });

  it("is not made for a page with too many nodes", () => {
    mount(`<i>${"<b></b>".repeat(GHOST_MAX_NODES + 1)}</i>`);
    pageMotionCapture();
    pageMotionRun("forward");
    expect(ghost()).toBeNull();
    // no old page to slide over: the new one fades up from the ground instead
    expect(stage().getAttribute("data-pg")).toBe("rise");
  });

  it("is taken for a route change no tap announced, unless a tap already did or it is a Back", () => {
    pageMotionCaptureIfNone();
    pageMotionRun("forward");
    expect(ghost()).not.toBeNull();
    pageMotionReset();

    pageMotionCapture();
    const drawn = drawImage.mock.calls.length;
    pageMotionCaptureIfNone();
    expect(drawImage.mock.calls.length).toBe(drawn);
    pageMotionReset();

    pageMotionNotePop();
    pageMotionCaptureIfNone();
    pageMotionRun("forward");
    expect(ghost()).toBeNull();
  });

  it("starts from where an interrupted page had got to", () => {
    const scroll = document.querySelector<HTMLElement>(".pk-scroll")!;
    stage().setAttribute("data-pg", "forward");
    (stage() as unknown as { getAnimations: () => unknown[] }).getAnimations =
      () => [
        {
          animationName: "v3-pg-in-fwd",
          effect: { target: scroll },
        },
      ];
    const cs = window.getComputedStyle.bind(window);
    jest.spyOn(window, "getComputedStyle").mockImplementation((el) => {
      const real = cs(el);
      if (el !== scroll) return real;
      return {
        transform: "matrix(1, 0, 0, 1, 120, 0)",
        opacity: "0.8",
      } as unknown as CSSStyleDeclaration;
    });
    pageMotionCapture();
    pageMotionRun("back");
    const copy = ghost()!.querySelector<HTMLElement>(".pk-scroll")!;
    expect(copy.style.transform).toBe("matrix(1, 0, 0, 1, 120, 0)");
    expect(copy.style.opacity).toBe("0.8");
    jest.restoreAllMocks();
  });

  it("is replaced by the next tap, and by the next run", () => {
    pageMotionCapture();
    pageMotionCapture();
    pageMotionRun("forward");
    expect(host().querySelectorAll(".pk-pg-ghost")).toHaveLength(1);
    pageMotionCapture();
    pageMotionRun("rise");
    expect(host().querySelectorAll(".pk-pg-ghost")).toHaveLength(1);
    expect(stage().getAttribute("data-pg")).toBe("rise");
  });
});

describe("when nothing moves", () => {
  it("a null kind clears everything", () => {
    pageMotionCapture();
    pageMotionRun(null);
    expect(ghost()).toBeNull();
    expect(stage().hasAttribute("data-pg")).toBe(false);
  });

  it("with animations switched off there is no copy and no mark", () => {
    document.documentElement.setAttribute("data-animations", "off");
    pageMotionCapture();
    pageMotionRun("forward");
    expect(ghost()).toBeNull();
    expect(stage().hasAttribute("data-pg")).toBe(false);
  });

  it("Reduce Motion writes off too and still gets its crossfade", () => {
    document.documentElement.setAttribute("data-animations", "off");
    reduced(true);
    pageMotionCapture();
    pageMotionRun("forward");
    expect(stage().getAttribute("data-pg")).toBe("forward");
    expect(ghost()).not.toBeNull();
  });

  it("with reduced motion and no copy there is nothing to cross over", () => {
    reduced(true);
    pageMotionRun("forward");
    expect(stage().hasAttribute("data-pg")).toBe(false);
  });

  it("with reduced motion and a copy the stage is marked for the crossfade", () => {
    reduced(true);
    pageMotionCapture();
    pageMotionRun("forward");
    expect(stage().getAttribute("data-pg")).toBe("forward");
    expect(ghost()).not.toBeNull();
  });

  it("without a stage it does nothing", () => {
    document.body.innerHTML = "";
    expect(() => {
      pageMotionCapture();
      pageMotionRun("forward");
    }).not.toThrow();
  });
});
