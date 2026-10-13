/**
 * @jest-environment jsdom
 *
 * Settings → Appearance (SettingsScreen.jsx): each theme is the Home screen
 * drawn small (System cut down the middle, Time on the diagonal with the sun /
 * moon disc), the nine accents each carry their own `data-accent`, the card
 * ends in its progress bar, and the Time card reads out where the sun is.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { AppearanceSection } from "../AppearanceSection";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => ({ data: { kind: "free" } }),
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useSettings: () => ({ data: { prefs: {} } }),
  useUpdateSettings: () => ({ mutateAsync: jest.fn(async () => ({})) }),
  useSetPref: () => jest.fn(async () => ({})),
}));

describe("Settings → Appearance", () => {
  let host: HTMLDivElement;
  let root: Root;

  const mount = async (theme: string) => {
    useNeedt3Ui.setState({ theme: theme as never, accent: "blue" as never });
    host = document.createElement("div");
    host.className = "needt-v3";
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(h(AppearanceSection, { onUpgrade: jest.fn() }));
    });
  };

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const tile = (id: string) =>
    host.querySelector(`[data-theme-tile="${id}"]`) as HTMLElement;

  it("draws the Home screen in every theme tile, not a diagram", async () => {
    await mount("light");
    for (const id of ["system", "light", "dark", "time"]) {
      const pic = tile(id).querySelector(".docs-mi-miniature-1");
      expect(pic).not.toBeNull();
      expect(pic?.textContent).toContain("Draft the launch brief");
    }
  });

  it("Light and Dark are one nested scope each, in their own theme", async () => {
    await mount("light");
    expect(
      tile("light").querySelector('.needt-v3[data-theme="light"]')
    ).not.toBeNull();
    expect(
      tile("dark").querySelector('.needt-v3[data-theme="dark"]')
    ).not.toBeNull();
  });

  it("System is cut down the middle, Light left and Dark right", async () => {
    await mount("light");
    const sides = [
      ...tile("system").querySelectorAll(".docs-mi-miniature-s1"),
    ] as HTMLElement[];
    expect(sides.map((s) => s.getAttribute("data-theme"))).toEqual([
      "light",
      "dark",
    ]);
    expect(sides[0].classList.contains("is-on")).toBe(true);
    expect(sides[1].classList.contains("is-on")).toBe(false);
  });

  it("Time is cut on the diagonal with the sun / moon disc and the Auto clock", async () => {
    await mount("light");
    const t = tile("time");
    expect(t.querySelector(".mi-diag-a")?.getAttribute("data-theme")).toBe(
      "light"
    );
    expect(t.querySelector(".mi-diag-b")?.getAttribute("data-theme")).toBe(
      "dark"
    );
    expect(t.querySelector(".mi-diag-disc svg")).not.toBeNull();
    expect(t.querySelector(".mi-diag-auto")?.textContent).toContain("Auto");
  });

  it("nested scopes wear the chosen accent", async () => {
    await mount("light");
    for (const el of host.querySelectorAll(
      ".settings-theme-tile-theme-tile .needt-v3"
    ))
      expect(el.getAttribute("data-accent")).toBe("blue");
  });

  it("shows the nine accents, each with its own data-accent, and the bar", async () => {
    await mount("light");
    const ids = [
      ...host.querySelectorAll("button.settings-accent-swatch-accent"),
    ].map((b) => b.getAttribute("data-accent"));
    expect(ids).toEqual([
      "blue",
      "pink",
      "mint",
      "violet",
      "amber",
      "graphite",
      "aurora",
      "sunset",
      "lagoon",
    ]);
    expect(
      host.querySelector(
        ".settings-accent-card-row-3 .settings-accent-card-span"
      )
    ).not.toBeNull();
  });

  it("the Time card reads where the sun is only while Time is chosen", async () => {
    await mount("light");
    expect(host.querySelector("[data-time-now]")).toBeNull();
    await act(async () => root.unmount());
    host.remove();
    await mount("time");
    expect(host.querySelector("[data-time-now]")?.textContent).toMatch(
      /^Now: (Dawn|Day|Golden hour|Dusk|Night) · (sunrise|sunset|no sun)/
    );
  });
});
