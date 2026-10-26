/**
 * The phone's page change (owner decision 2026-10-26): what the stylesheet
 * says about timing, curve, what moves and what must not, and the reduced
 * motion branch. The direction logic is tested in
 * phone/shell/__tests__/pageMotion.test.ts; this pins the numbers the script
 * and the sheet share.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { type AtRule, type Rule, parse } from "postcss";

import { PAGE_MOTION_MS } from "@/components/needt3/phone/shell/pageMotion";

const FILE = "src/styles/v3-overrides/phone-page-motion.css";
const source = readFileSync(path.join(process.cwd(), FILE), "utf8");
const root = parse(source, { from: FILE });

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** `--name: value` declared on the phone scope. */
function token(name: string): string {
  let out = "";
  root.walkRules((r) => {
    if (norm(r.selector) !== '.needt-v3[data-ui="phone"]') return;
    r.walkDecls(name, (d) => {
      out = norm(d.value).replace(/\s*\/\*.*$/, "");
    });
  });
  return out;
}

function keyframes(name: string): AtRule {
  let found: AtRule | undefined;
  root.walkAtRules("keyframes", (a) => {
    if (a.params === name) found = a;
  });
  expect(found).toBeDefined();
  return found as AtRule;
}

const keyframeProps = (name: string) => {
  const props = new Set<string>();
  keyframes(name).walkDecls((d) => {
    props.add(d.prop);
  });
  return [...props].sort();
};

/** Every `animation` declaration outside the reduced-motion block. */
function animations(inReduced = false) {
  const out: { selector: string; value: string; important: boolean }[] = [];
  root.walkRules((r: Rule) => {
    const reduced = r.parent?.type === "atrule";
    if (reduced !== inReduced) return;
    r.walkDecls("animation", (d) => {
      out.push({
        selector: norm(r.selector),
        value: norm(d.value),
        important: !!d.important,
      });
    });
  });
  return out;
}

describe("page change timing", () => {
  it("the sheet's durations are the script's", () => {
    expect(token("--pg-slide")).toBe(`${PAGE_MOTION_MS.slide}ms`);
    expect(token("--pg-rise")).toBe(`${PAGE_MOTION_MS.rise}ms`);
    expect(token("--pg-fade")).toBe(`${PAGE_MOTION_MS.fade}ms`);
  });

  it("slide and rise are 320-380 ms, the reduced crossfade is 150 ms", () => {
    for (const ms of [PAGE_MOTION_MS.slide, PAGE_MOTION_MS.rise]) {
      expect(ms).toBeGreaterThanOrEqual(320);
      expect(ms).toBeLessThanOrEqual(380);
    }
    expect(PAGE_MOTION_MS.fade).toBe(150);
  });

  it("the curve is the house ease, never a spring", () => {
    expect(token("--pg-ease")).toBe("var(--nx-ease)");
    const values: string[] = [];
    root.walkDecls((d) => {
      values.push(d.value);
    });
    expect(values.join(" ")).not.toMatch(/cubic-bezier\(|spring\(|linear\(/);
  });

  it("every movement runs on the page token and the house ease", () => {
    const moving = animations().filter((a) => /v3-pg-/.test(a.value));
    expect(moving.length).toBeGreaterThanOrEqual(5);
    for (const a of moving)
      expect(a.value).toMatch(
        /^v3-pg-[a-z-]+ var\(--pg-(slide|rise)\) var\(--pg-ease\) (backwards|forwards)$/
      );
  });
});

describe("page change: what moves", () => {
  it("only transform and opacity are animated", () => {
    for (const name of [
      "v3-pg-in-fwd",
      "v3-pg-in-back",
      "v3-pg-in-rise",
      "v3-pg-in-fade",
      "v3-pg-sheet-fwd-out",
      "v3-pg-sheet-back-out",
    ])
      for (const p of keyframeProps(name))
        expect(["opacity", "transform"]).toContain(p);
  });

  it("forward comes in from the right and back from the left, whole screen", () => {
    expect(norm(source)).toContain(
      "@keyframes v3-pg-in-fwd { from { transform: translate3d(100%, 0, 0); } }"
    );
    expect(norm(source)).toContain(
      "@keyframes v3-pg-in-back { from { transform: translate3d(-100%, 0, 0); } }"
    );
  });

  it("the old page gives way the other way, and dims", () => {
    const fwd = norm(keyframes("v3-pg-sheet-fwd-out").toString());
    const back = norm(keyframes("v3-pg-sheet-back-out").toString());
    expect(fwd).toContain("translate3d(calc(var(--pg-parallax) * -1), 0, 0)");
    expect(back).toContain("translate3d(var(--pg-parallax), 0, 0)");
    expect(fwd).toContain("opacity: var(--pg-dim)");
    expect(back).toContain("opacity: var(--pg-dim)");
    const dim = Number(token("--pg-dim"));
    expect(dim).toBeGreaterThan(0.3);
    expect(dim).toBeLessThan(1);
    expect(parseFloat(token("--pg-parallax"))).toBeLessThanOrEqual(30);
  });

  it("a menu place rises from 0.96 with a short lift and a fade, never past 1", () => {
    const rise = norm(keyframes("v3-pg-in-rise").toString());
    expect(rise).toContain("opacity: 0");
    expect(rise).toContain("translate3d(0, var(--pg-lift), 0)");
    expect(rise).toContain("scale(var(--pg-rise-scale))");
    expect(token("--pg-rise-scale")).toBe("0.96");
    expect(token("--pg-lift")).toMatch(/^\d+px$/);
    // the rise starts at the dock: the bottom edge of the first screen
    expect(source).toContain("transform-origin: 50% 100dvh");
  });

  it("the transform sits on the screen's content, so the fixed fog stays still", () => {
    for (const a of animations()) {
      if (!/v3-pg-in-/.test(a.value)) continue;
      // however deep the place wraps its screen, never the screen's own root
      expect(a.selector).toContain(".pk-screen > .pk-scroll:not(");
    }
    expect(source).not.toMatch(/\.pk-fog/);
  });

  it("the loading skeleton does not start a second entry", () => {
    for (const a of animations())
      if (/v3-pg-in-/.test(a.value))
        expect(a.selector).toContain(":not(.pk-screen, .st-route-loading)");
  });

  it("nothing is fixed, shadowed, will-changed or a layout property", () => {
    const props: string[] = [];
    root.walkDecls((d) => {
      props.push(d.prop === "position" ? `position:${d.value}` : d.prop);
    });
    expect(props).not.toContain("position:fixed");
    expect(props).not.toContain("box-shadow");
    expect(props).not.toContain("will-change");
    for (const name of [
      "v3-pg-in-fwd",
      "v3-pg-in-back",
      "v3-pg-in-rise",
      "v3-pg-in-fade",
    ])
      expect(keyframeProps(name).join()).not.toMatch(
        /width|height|top|left|margin|padding/
      );
  });

  it("the still copy is frozen: no animation, no transition, no glass", () => {
    const frozen = root.nodes.find(
      (n): n is Rule =>
        n.type === "rule" && n.selector.includes(".pk-pg-sheet *::after")
    );
    expect(frozen).toBeDefined();
    const text = norm(frozen!.toString());
    expect(text).toContain("animation: none !important");
    expect(text).toContain("transition: none !important");
    expect(text).toContain("backdrop-filter: none !important");
  });
});

describe("page change: reduced motion", () => {
  const block = () => {
    let at: AtRule | undefined;
    root.walkAtRules("media", (a) => {
      if (/prefers-reduced-motion:\s*reduce/.test(a.params)) at = a;
    });
    expect(at).toBeDefined();
    return at as AtRule;
  };

  it("is a 150 ms plain crossfade, with no movement", () => {
    const anims = animations(true);
    const fade = anims.find((a) => a.value.includes("v3-pg-in-fade"));
    expect(fade).toBeDefined();
    expect(fade!.value).toBe("v3-pg-in-fade var(--pg-fade) ease-out backwards");
    expect(fade!.important).toBe(true);
    expect(keyframeProps("v3-pg-in-fade")).toEqual(["opacity"]);
    // the old page stays where it is
    expect(norm(block().toString())).toContain(
      ".pk-pg-sheet { animation: none !important; }"
    );
  });

  it("out-ranks the global 1 ms rules, both of them", () => {
    const text = norm(block().toString());
    // an id beats the base rule's seven classes and html[data-animations=off] *,
    // which MotionRuntime also sets for Reduce Motion: no guard on the attribute,
    // the script decides whether there is a crossfade at all
    expect(text).toContain(":not(#pg)");
    expect(text).not.toContain("data-animations");
  });
});
