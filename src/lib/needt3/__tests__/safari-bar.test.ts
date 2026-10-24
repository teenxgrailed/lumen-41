import {
  BOTTOM_BAR_MIN_GAP_PX,
  VIEWPORT_BOOT_SCRIPT,
  type ViewportReading,
  safariBarOf,
} from "@/lib/needt3/safari-bar";

/** iOS 26 simulator, iPhone 17 Pro, the safari-phone probe's numbers. */
const tab = (largeViewport: number, innerHeight: number): ViewportReading => ({
  standalone: false,
  ios: true,
  largeViewport,
  screenWidth: 402,
  screenHeight: 874,
  innerWidth: 402,
  innerHeight,
});
const rule = (r: ViewportReading) => safariBarOf(r, BOTTOM_BAR_MIN_GAP_PX);

describe("safariBarOf (measured layouts)", () => {
  it("Compact: the large viewport stops 120 px short of the screen", () => {
    expect(rule(tab(754, 714))).toBe("bottom");
    expect(rule(tab(754, 754))).toBe("bottom");
  });

  it("Bottom: the same, whatever innerHeight does", () => {
    expect(rule(tab(754, 654))).toBe("bottom");
    expect(rule(tab(754, 754))).toBe("bottom");
  });

  it("Top: the large viewport is the screen (or the screen less the status row at load)", () => {
    expect(rule(tab(812, 660))).toBe("top");
    expect(rule(tab(874, 660))).toBe("top");
    expect(rule(tab(874, 768))).toBe("top");
  });

  it("knows nothing in the installed app, off iOS, in landscape or without lvh", () => {
    expect(rule({ ...tab(874, 874), standalone: true })).toBeNull();
    expect(rule({ ...tab(754, 714), ios: false })).toBeNull();
    expect(rule({ ...tab(330, 360), innerWidth: 874 })).toBeNull();
    expect(rule(tab(0, 714))).toBeNull();
  });
});

type Attrs = Record<string, string>;

function boot(opts: {
  ua?: string;
  standalone?: boolean;
  lvh: number;
  innerHeight?: number;
}) {
  const attrs: Attrs = {};
  const listeners: Record<string, Array<(e?: unknown) => void>> = {};
  const html = {
    setAttribute: (k: string, v: string) => (attrs[k] = v),
    getAttribute: (k: string) => attrs[k] ?? null,
    removeAttribute: (k: string) => delete attrs[k],
    appendChild: () => undefined,
    removeChild: () => undefined,
  };
  const win = {
    navigator: {
      userAgent:
        opts.ua ??
        "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1",
      standalone: opts.standalone ?? false,
      platform: "iPhone",
      maxTouchPoints: 5,
    },
    screen: { width: 402, height: 874 },
    innerWidth: 402,
    innerHeight: opts.innerHeight ?? 714,
    matchMedia: () => ({ matches: false }),
    addEventListener: (type: string, fn: () => void) => {
      (listeners[type] ??= []).push(fn);
    },
  };
  const doc = {
    documentElement: html,
    createElement: () => ({ style: {}, offsetHeight: opts.lvh }),
  };
  new Function("window", "document", VIEWPORT_BOOT_SCRIPT)(win, doc);
  return { attrs, listeners, win };
}

describe("VIEWPORT_BOOT_SCRIPT", () => {
  it("writes browser + bottom for Compact / Bottom before paint", () => {
    const { attrs } = boot({ lvh: 754 });
    expect(attrs["data-display-mode"]).toBe("browser");
    expect(attrs["data-safari-bar"]).toBe("bottom");
  });

  it("writes top for the Top layout", () => {
    expect(boot({ lvh: 812, innerHeight: 660 }).attrs["data-safari-bar"]).toBe(
      "top"
    );
  });

  it("writes standalone and no bar in the installed app", () => {
    const { attrs } = boot({ lvh: 874, standalone: true });
    expect(attrs["data-display-mode"]).toBe("standalone");
    expect(attrs["data-safari-bar"]).toBeUndefined();
  });

  it("writes no bar outside iOS", () => {
    const { attrs } = boot({
      lvh: 700,
      ua: "Mozilla/5.0 (Linux; Android 15) Chrome/130 Mobile Safari/537.36",
    });
    expect(attrs["data-display-mode"]).toBe("browser");
    expect(attrs["data-safari-bar"]).toBeUndefined();
  });

  it("listens for resize and settles again after load", () => {
    const { listeners } = boot({ lvh: 754 });
    expect(listeners.resize).toHaveLength(1);
    expect(listeners.load).toHaveLength(1);
    expect(() => listeners.resize[0]({ type: "resize" })).not.toThrow();
  });

  it("never throws without a DOM", () => {
    expect(() =>
      new Function("window", "document", VIEWPORT_BOOT_SCRIPT)({}, {})
    ).not.toThrow();
  });
});
