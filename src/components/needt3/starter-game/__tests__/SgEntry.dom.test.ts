/**
 * @jest-environment jsdom
 *
 * The Starter game's entry card: the right title per screen, Start and the two
 * quiet buttons, and on Free the PRO pill with "Try with Pro".
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { SgEntry } from "../SgEntry";
import { SG_ENTRY } from "../model";

jest.mock("../../orb/AiOrb", () => ({ AiOrb: () => null }));
jest.mock("../../paywall/Pro", () => ({
  ProBadge: () => h("span", { className: "pro-badge" }, "PRO"),
}));

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

const draw = (props: Partial<Parameters<typeof SgEntry>[0]> = {}) => {
  const fns = {
    onStart: jest.fn(),
    onUpgrade: jest.fn(),
    onHide: jest.fn(),
  };
  act(() => root.render(h(SgEntry, { entry: "home", ...fns, ...props })));
  return fns;
};
const click = (sel: string) =>
  act(() => (host.querySelector(sel) as HTMLButtonElement).click());

it("is titled by the screen it sits on", () => {
  for (const screen of ["home", "calendar", "tasks"] as const) {
    draw({ entry: screen });
    expect(host.querySelector("h3")?.textContent).toBe(SG_ENTRY[screen].title);
  }
  expect(SG_ENTRY.home.title).toBe("Sort out your day");
  expect(SG_ENTRY.calendar.title).toBe("Fill your week");
  expect(SG_ENTRY.tasks.title).toBe("Empty your head");
});

it("starts, and hides for 7 days or for good", () => {
  const fns = draw();
  click('[data-sg="start"]');
  expect(fns.onStart).toHaveBeenCalledTimes(1);
  click('[data-sg="not-now"]');
  expect(fns.onHide).toHaveBeenLastCalledWith("7d");
  click('[data-sg="never"]');
  expect(fns.onHide).toHaveBeenLastCalledWith("never");
  expect(host.querySelector(".pro-badge")).toBeNull();
});

it("on Free wears PRO and sends the button to the plans", () => {
  const fns = draw({ locked: true, upgradeLabel: "Try with Pro" });
  expect(host.querySelector(".pro-badge")).not.toBeNull();
  expect(host.querySelector('[data-sg="start"]')).toBeNull();
  click('[data-sg="upgrade"]');
  expect(fns.onUpgrade).toHaveBeenCalledTimes(1);
  expect(fns.onStart).not.toHaveBeenCalled();
  expect(host.querySelector('[data-sg="upgrade"]')?.textContent).toBe(
    "Try with Pro"
  );
});
