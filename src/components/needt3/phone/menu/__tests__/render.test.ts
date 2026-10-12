/**
 * Smoke render (server markup) of menu A: the DOM the vendored nav-a.css
 * selects on, and the contracts the composer (P3) and the host (PhoneShell)
 * rely on. Gestures and springs need a browser; their decisions are covered by
 * lib/needt3/__tests__/menu-a.test.ts.
 */
import { createElement as h } from "react";

import { renderToStaticMarkup } from "react-dom/server";

import { Menu, type MenuProps } from "../Menu";

const base: MenuProps = {
  side: "light",
  screen: "home",
  tiles: ["home", "docs", "ask"],
  counts: { overdue: 3, today: 4, mail: 2 },
  me: { name: "Maksym", initial: "M", plan: "Free", pro: false },
  onPick: () => {},
  onSettings: () => {},
};

const html = (over: Partial<MenuProps> = {}) =>
  renderToStaticMarkup(h(Menu, { ...base, ...over }));

describe("Menu A markup", () => {
  it("the closed pill is one element: data-nva-pill on the glass", () => {
    const out = html();
    expect(out.match(/data-nva-pill/g)).toHaveLength(1);
    expect(out).toMatch(/class="nva-glass"[^>]*data-nva-pill=""/);
  });

  it("starts at the pill, with the vendored root and mode attributes", () => {
    const out = html();
    expect(out).toContain('data-nva-mode="pill"');
    expect(out).toContain('data-nav-variant="A"');
    expect(out).toContain("nva is-light");
    expect(html({ side: "dark" })).toContain("nva is-dark");
  });

  it("the menu wears the opposite theme", () => {
    expect(html({ side: "light" })).toContain("nva-shape dark");
    expect(html({ side: "dark" })).toContain("nva-shape paper");
    expect(html({ side: "light" })).toContain("nva-add dark");
  });

  it("carries a new-task control and the three places in the pill", () => {
    const out = html();
    expect(out).toContain('aria-label="New task"');
    expect(out).toContain("data-nva-add");
    for (const id of ["home", "docs", "ask"])
      expect(out).toContain(`data-nva-icon="${id}"`);
    expect(out).toContain("data-nva-open");
  });

  it("the card: the three as tiles, every other place as a row, Settings among them", () => {
    const out = html();
    for (const id of ["home", "docs", "ask"])
      expect(out).toContain(`data-nva-tile="${id}"`);
    expect(out).not.toContain('data-nva-row="home"');
    for (const id of [
      "calendar",
      "tasks",
      "mail",
      "habits",
      "moodboards",
      "projects",
      "templates",
      "shared",
      "trash",
      "connections",
      "settings",
    ])
      expect(out).toContain(`data-nva-row="${id}"`);
    expect(out).toContain('data-nva-row="profile"');
    expect(out).toContain("Maksym");
  });

  it("rows say what is waiting, alerts are marked", () => {
    const out = html({ tiles: ["calendar", "docs", "ask"] });
    expect(out).toContain("3 overdue · 4 left today");
    expect(out).toContain("nva-row-cap is-alert");
    expect(out).toContain("2 unread");
  });

  it("the tile badge: unread mail, overdue", () => {
    const out = html({ tiles: ["home", "mail", "tasks"] });
    expect(out).toContain("nva-tile-badge is-alert");
    expect(out).toContain(">2</span>");
  });

  it("marks where you are: the tile and the dot grid", () => {
    expect(html({ screen: "home" })).toContain("nva-tile is-on");
    const away = html({ screen: "calendar" });
    expect(away).toContain("nva-dots is-here");
    expect(away).toContain("you are in Calendar");
    expect(away).toContain('class="nva-row is-on"');
  });

  it("away and morph are classes the vendored css reads", () => {
    const out = html({ away: true, morph: true });
    expect(out).toContain("is-away");
    expect(out).toContain("is-morph");
  });

  it("away makes the whole menu inert, not aria-hidden (its buttons would stay focusable)", () => {
    const root = (o: string) => o.match(/<div class="nva [^>]*>/)?.[0] ?? "";
    expect(root(html({ away: true }))).toContain('inert=""');
    expect(root(html({ away: true }))).not.toContain("aria-hidden");
    expect(root(html())).not.toContain("inert");
  });

  it("the Every place button says it is expanded and points at the card region", () => {
    const out = html();
    const btn = out.match(/<button[^>]*data-nva-open[^>]*>/)?.[0] ?? "";
    expect(btn).toContain('aria-expanded="false"');
    const controls = btn.match(/aria-controls="([^"]+)"/)?.[1];
    expect(controls).toBeTruthy();
    // the id it points at is on the card's content region
    expect(out).toContain(`class="nva-content" id="${controls}"`);
  });

  it("the shadow is nine-slice pieces, three sets, with no filter", () => {
    const out = html();
    expect(out.match(/class="nva-sh-set"/g)).toHaveLength(3);
    expect(out.match(/class="nva-sh /g)?.length ?? 0).toBeGreaterThanOrEqual(
      12
    );
    expect(out).not.toContain("drop-shadow");
  });

  it("is plain markup: no React-owned style on anything that moves", () => {
    const out = html();
    // only the scrim's pointer-events and the static shadow pieces carry style
    const styled = out.match(/style="[^"]*"/g) ?? [];
    for (const s of styled)
      expect(s).toMatch(
        /pointer-events|width:|height:|left:|top:|border-radius/
      );
    expect(out).not.toMatch(/style="[^"]*(transform|clip-path|opacity)/);
  });

  it("tucked away shows a handle to bring it back only when hidden (state, not markup)", () => {
    expect(html()).not.toContain("data-nva-handle");
  });
});
