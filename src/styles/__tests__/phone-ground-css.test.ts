/**
 * The phone page scrolls like a document (owner decision 2026-10-20). Nothing
 * that paints is fixed to the top or bottom edge at rest, so Safari 26 paints
 * its bars from the page colour, which is the app theme's ground.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(
  path.join(process.cwd(), "src/styles/v3-overrides/phone-ground.css"),
  "utf8"
);

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

describe("phone page ground", () => {
  it("the scope is not fixed and is not sized by a fixed height", () => {
    const body = rule('.needt-v3[data-ui="phone"]');
    expect(body).not.toContain("position: fixed");
    expect(body).not.toContain("inset: 0");
    expect(body).toContain("background: var(--v2p-ground)");
    expect(css).not.toContain('[data-ui="phone"]::before');
    expect(css).not.toContain("v3-edge-tint");
  });

  it("html and body wear the ground and grow with the page", () => {
    const body = rule(
      'html:has(.needt-v3[data-ui="phone"]),\nhtml:has(.needt-v3[data-ui="phone"]) body'
    );
    expect(body).toContain("background-color: #f6f6f3 !important");
    expect(body).toContain("height: auto");
    const dark = rule(
      'html:has(.needt-v3[data-ui="phone"][data-theme="dark"]),\nhtml:has(.needt-v3[data-ui="phone"][data-theme="dark"]) body,\nhtml:has(.needt-v3[data-ui="phone"][data-theme="dim"]),\nhtml:has(.needt-v3[data-ui="phone"][data-theme="dim"]) body'
    );
    expect(dark).toContain("background-color: #141416 !important");
  });

  it("a page whose paper reaches the top makes that paper the ground", () => {
    const light = rule(
      'html[data-ground="page"]:has(.needt-v3[data-ui="phone"]),\nhtml[data-ground="page"]:has(.needt-v3[data-ui="phone"]) body'
    );
    expect(light).toContain("var(--v3-page-ground-l, #f6f6f3) !important");
    expect(css).toContain("var(--v3-page-ground-d, #141416) !important");
    // switched per page, never animated
    expect(light).not.toContain("transition");
    const reader = readFileSync(
      path.join(
        process.cwd(),
        "src/components/needt3/phone/docs/ReaderPhone.tsx"
      ),
      "utf8"
    );
    expect(reader).toContain('html.setAttribute("data-ground", "page")');
    expect(reader).toContain('html.removeAttribute("data-ground")');
  });

  it("the installed app's document is at least the whole screen tall", () => {
    // a scroll-locked page was 100dvh, the small viewport on a fresh load,
    // and iOS shrank innerHeight to it (the sheet stopped 62 pt short)
    const at = css.indexOf("@media (display-mode: standalone)");
    expect(at).toBeGreaterThanOrEqual(0);
    const block = css.slice(at, css.indexOf("}\n}", at));
    expect(block).toContain('html:has(.needt-v3[data-ui="phone"])');
    expect(block).toContain("min-height: 100lvh");
  });

  it("nothing boxy sits behind the dock: no shadow pieces, no backdrop layer of its own", () => {
    // owner 2026-10-26: the shadow's straight-edge pieces were a darker
    // rectangle behind the pill. The dock is a pill and a round + on the fog.
    expect(rule('.needt-v3[data-ui="phone"] .nva-shadow')).toContain(
      "display: none"
    );
    // the only backdrop-filter at the dock is the pill's and the + button's
    // own glass (nav-a.css), cut to their shapes; none of the phone overrides
    // adds a rectangular one around them
    const decls = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) =>
      /backdrop-filter\s*:\s*(?!none)/.test(m[2])
    );
    expect(decls.map((m) => m[1].trim())).toEqual([]);
  });

  it("the fog host sits under the menu, the sheets and their scrims", () => {
    const kit = readFileSync(
      path.join(process.cwd(), "src/styles/v3/phone-kit.css"),
      "utf8"
    );
    // locate the rule by its literal selector, then read z-index from its
    // body with a fixed regex (no pattern built from a variable)
    const z = (sel: string) => {
      const at = kit.indexOf(`${sel} {`);
      const body = at < 0 ? "" : kit.slice(at, kit.indexOf("}", at));
      return Number(body.match(/z-index: (\d+)/)?.[1]);
    };
    const nav = readFileSync(
      path.join(process.cwd(), "src/styles/v3/nav-a.css"),
      "utf8"
    );
    const fog = z(".needt-v3 .pk-fog");
    const menu = Number(nav.match(/\.nva \{[^}]*z-index: (\d+)/)?.[1]);
    expect(fog).toBeGreaterThan(0);
    expect(menu).toBeGreaterThan(fog);
    expect(z(".needt-v3 .pk-scrim")).toBeGreaterThan(fog);
    expect(z(".needt-v3 .pk-sheet-layer")).toBeGreaterThan(fog);
  });

  it("the screen has no inner scroller", () => {
    const scroll = rule('.needt-v3[data-ui="phone"] .pk-scroll');
    expect(scroll).toContain("overflow: visible");
    expect(scroll).toContain("padding-top: var(--v3-top)");
    // the installed app: the design's 52 px status row, or the real inset
    expect(css).toContain("--v3-top: max(52px, env(safe-area-inset-top, 0px))");
    // a Safari tab: the status row is Safari's and outside the page (inset
    // 0), so the header hugs Safari's bar, like Budget's .nd-main
    expect(
      rule('html[data-display-mode="browser"] .needt-v3[data-ui="phone"]')
    ).toContain("--v3-top: env(safe-area-inset-top, 0px)");
  });

  it("the layers that stay put are fixed, and only those", () => {
    const fixed = rule(
      '.needt-v3[data-ui="phone"] .pk-fog,\n.needt-v3[data-ui="phone"]\n  :is(.pk-scrim, .pk-sheet-layer, .nva, .pk-sweep.is-screen)'
    );
    expect(fixed).toContain("position: fixed");
  });

  it("nothing is fixed at the top of the screen: no top band, no small title (owner decision 2026-10-25)", () => {
    for (const gone of [
      "pk-topband",
      "pk-compact",
      "--ps-top-h",
      "--v3-compact-h",
    ])
      expect(css).not.toContain(gone);
  });

  it("no full-width fixed layer touches an edge", () => {
    // the fog host has no height; the paint is in children
    expect(rule('.needt-v3[data-ui="phone"] .pk-fog')).toContain("height: 0");
    // the full-screen layers stand in from both edges
    const inset = rule(
      '.needt-v3[data-ui="phone"] :is(.pk-scrim, .pk-sweep.is-screen),\n.needt-v3[data-ui="phone"] :is(.pk-sheet-layer, .nva)'
    );
    expect(inset).toContain("top: var(--v3-edge)");
    expect(inset).toContain("bottom: var(--v3-edge)");
    expect(css).toContain("--v3-edge: 8px");
  });

  it("on iOS no colour reaches the display edge: the gaps are 6 px top, 5 px bottom", () => {
    // Safari 26 samples the top (~4 px) and bottom (~3 px) once and keeps the
    // tint, even for absolute children of a zero-height fixed host.
    expect(css).toMatch(
      /@supports \(-webkit-touch-callout: none\) \{\s*\.needt-v3\[data-ui="phone"\] \{\s*--v3-gap-top: 6px;\s*--v3-gap-bot: 5px;/
    );
    expect(css).toContain("--v3-gap-top: 0px");
    expect(css).toContain("--v3-gap-bot: 0px");
    // the fog's wash (a colour) stops short of the edge ...
    expect(
      rule('.needt-v3[data-ui="phone"] .pk-fog > :not(.pk-fog-dots, .pk-blur)')
    ).toContain("height: calc(var(--ps-fog-h) - var(--v3-gap-bot))");
    // ... the blur layers (no colour of their own) run to it
    expect(
      rule('.needt-v3[data-ui="phone"] .pk-fog > :not(.pk-fog-dots)')
    ).toContain("height: var(--ps-fog-h);");
    expect(
      rule(
        '.needt-v3[data-ui="phone"] .pk-scrim > *,\n.needt-v3[data-ui="phone"] .nva-scrim'
      )
    ).toContain("calc(var(--v3-gap-top) - var(--v3-edge))");
  });

  it("bottom-anchored phone chrome floats above the safe-area inset", () => {
    for (const [sel, px] of [
      [".pd-actbar", 26],
      [".ma-menu-pill", 14],
    ] as const) {
      expect(rule(`.needt-v3[data-ui="phone"] ${sel}`)).toContain(
        `bottom: calc(${px}px + var(--v3-sab))`
      );
    }
    expect(rule('.needt-v3[data-ui="phone"] .pov-snack')).toContain(
      "bottom: calc(92px + var(--v3-dock-lift) + var(--v3-sab))"
    );
    // the dock sits 30 px above the display edge (54 px more in a Safari tab)
    expect(rule('.needt-v3[data-ui="phone"] .nva-body')).toContain(
      "bottom: calc(10px + var(--v3-dock-lift) - var(--v3-edge))"
    );
    expect(rule('.needt-v3[data-ui="phone"] .nva')).toContain(
      "padding-bottom: var(--v3-dock-lift)"
    );
    expect(css).toContain("--v3-dock-lift: 20px");
    // lifted only with Safari's tab bar at the bottom (Compact / Bottom); the
    // Top layout, the installed app and unknown keep the design's 30 px
    expect(
      rule(
        'html[data-display-mode="browser"][data-safari-bar="bottom"]\n  .needt-v3[data-ui="phone"]'
      )
    ).toContain("--v3-dock-lift: 74px");
    expect(css.match(/--v3-dock-lift: 74px/g)).toHaveLength(1);
    expect(css).not.toMatch(
      /html\[data-display-mode="browser"\] \.needt-v3\[data-ui="phone"\] \{[^}]*--v3-dock-lift/
    );
    expect(rule('.needt-v3[data-ui="phone"] .pk-sheet')).toContain(
      "padding-bottom: var(--v3-sab)"
    );
    expect(rule('.needt-v3[data-ui="phone"] .pk-tail')).toContain(
      "112px + var(--v3-dock-lift)"
    );
    expect(rule('.needt-v3[data-ui="phone"] .pk-tail')).toContain(
      "var(--ps-fog-h) + 16px"
    );
    expect(css).toContain("--v3-sab: env(safe-area-inset-bottom, 0px)");
  });

  it("the sign-in scope is fixed to the viewport (unchanged)", () => {
    const auth = readFileSync(
      path.join(process.cwd(), "src/components/needt3/auth/AuthScope.tsx"),
      "utf8"
    );
    expect(auth).toContain("fixed inset-0");
  });

  it("the scope grows with the page on the phone and is dvh-tall off it", () => {
    const root = readFileSync(
      path.join(process.cwd(), "src/components/needt3/root/V3Root.tsx"),
      "utf8"
    );
    expect(root).toContain('ui === "phone" ? "min-h-dvh"');
    expect(root).toContain("h-dvh min-h-0 overflow-hidden");
    expect(root).toContain("data-ui={ui}");
    expect(root).toContain("PHONE_GROUND[resolved.side]");
  });
});
