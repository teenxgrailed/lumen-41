/**
 * @jest-environment jsdom
 *
 * "Show on Home" in the gear: each switch reports the flag it stands for, the
 * rail's tiles have up/down buttons that report the new order, and Home reads
 * the setting to draw or drop the rail (the layout sources are checked as text,
 * the way rail-layout.test.ts does; the whole screen is covered by Playwright).
 */
import { act, createElement as h } from "react";

import { readFileSync } from "fs";
import { join } from "path";
import { type Root, createRoot } from "react-dom/client";

import { DEFAULT_HOME_BLOCKS, type HomeBlocks } from "@/lib/needt3/home-blocks";

import { HomeBlocksForm } from "../HomeBlocksForm";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function mount(over: Partial<HomeBlocks> = {}) {
  const changes: Partial<HomeBlocks>[] = [];
  act(() => {
    root.render(
      h(HomeBlocksForm, {
        blocks: { ...DEFAULT_HOME_BLOCKS, ...over },
        onChange: (p: Partial<HomeBlocks>) => changes.push(p),
      })
    );
  });
  return changes;
}
const sw = (label: string) =>
  host.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;

describe("HomeBlocksForm", () => {
  it("has a switch for every block, all on by default", () => {
    mount();
    const ids = Array.from(host.querySelectorAll("[data-hb-row]")).map(
      (r) => (r as HTMLElement).dataset.hbRow
    );
    expect(ids).toEqual([
      "nextUp",
      "weather",
      "todayBar",
      "habits",
      "week",
      "schedule",
      "inbox",
    ]);
    for (const i of host.querySelectorAll("input[role=switch]"))
      expect((i as HTMLInputElement).checked).toBe(true);
  });

  it("a switch hides its block", () => {
    const changes = mount();
    act(() => sw("Show Habits on Home").click());
    expect(changes).toEqual([{ habits: false }]);
  });

  it("shows the switch state from the setting", () => {
    mount({ inbox: false });
    expect(sw("Show Inbox on Home").checked).toBe(false);
    expect(sw("Show Habits on Home").checked).toBe(true);
  });

  it("moves a rail tile up and down; the ends are disabled", () => {
    const changes = mount();
    const up = (id: string) =>
      host.querySelector(`[data-hb-up="${id}"]`) as HTMLButtonElement;
    const down = (id: string) =>
      host.querySelector(`[data-hb-down="${id}"]`) as HTMLButtonElement;
    expect(up("todayBar").disabled).toBe(true);
    expect(down("inbox").disabled).toBe(true);
    act(() => up("habits").click());
    expect(changes[0].order?.[0]).toBe("habits");
    act(() => down("todayBar").click());
    expect(changes[1].order?.[1]).toBe("todayBar");
    expect(host.querySelector('[data-hb-up="nextUp"]')).toBeNull();
  });
});

describe("Home reads the setting", () => {
  const repo = join(__dirname, "../../../../..");
  const tsx = readFileSync(
    join(repo, "src/components/needt3/home/HomeScreen.tsx"),
    "utf8"
  );
  const css = readFileSync(
    join(repo, "src/styles/v3-overrides/ha-home.css"),
    "utf8"
  );
  it("draws no rail when every tile is off, and the column takes the width", () => {
    expect(tsx).toMatch(/data-hd-rail=\{rail\.length \|\| tab === "week"/);
    expect(tsx).toMatch(/\{rail\.length \|\| tab === "week" \? \(\s*<aside/);
    expect(css).toMatch(
      /\.hd-body\[data-hd-rail="off"\] \{ grid-template-columns: minmax\(0, 1fr\); \}/
    );
  });
  it("gates the focus card and the weather on their flags", () => {
    expect(tsx).toMatch(/blocks\.weather \? \(/);
    expect(tsx).toMatch(/blocks\.nextUp \|\|/);
  });
});
