/**
 * @jest-environment jsdom
 *
 * A Budget frame that stays silent (blank: blocked, or signed out where Needt's
 * pages cannot render in a frame) gets a way out after 8 s: "Open Budget".
 * Budget's ready message removes it. Desktop is left alone until Budget has
 * been heard to send the message.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { BUDGET_ORIGIN } from "@/lib/needt3/budget";

import { BudgetFrame } from "../BudgetScreen";

jest.mock("react-icons/fi", () => ({
  FiCheck: () => null,
  FiLock: () => null,
}));
jest.mock("react-icons/lu", () => ({ LuWallet: () => null }));
jest.mock("@/lib/needt3/hooks/plan", () => ({ usePlan: () => ({}) }));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useSetPref: () => jest.fn(),
  useSettings: () => ({}),
}));
jest.mock("@/lib/use-store-distribution", () => ({
  useStoreDistribution: () => ({}),
}));
jest.mock("@/lib/needt3/pricing", () => ({ priceStrings: () => ({}) }));
jest.mock("../../paywall", () => ({ openPaywall: jest.fn() }));
jest.mock("../../scenes", () => ({ GlassCard: () => null, PxSky: () => null }));
jest.mock("@/components/providers/MotionRuntime", () => ({
  useNeedtReducedMotion: () => false,
}));

let host: HTMLDivElement;
let root: Root;
let scopeEl: HTMLDivElement;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  window.localStorage.clear();
  scopeEl = document.createElement("div");
  scopeEl.className = "needt-v3";
  document.body.appendChild(scopeEl);
  host = document.createElement("div");
  scopeEl.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  scopeEl.remove();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const fallback = () => host.querySelector("[data-bd-fallback]");
const wait = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });
const ready = (origin = BUDGET_ORIGIN) =>
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        data: { type: "needt:budget-ready" },
      })
    );
  });

describe("Budget frame way out", () => {
  it("shows on the phone after 8 s of silence, not before", () => {
    scopeEl.dataset.ui = "phone";
    act(() => root.render(h(BudgetFrame)));
    wait(7_000);
    expect(fallback()).toBeNull();
    wait(1_500);
    expect(fallback()).not.toBeNull();
  });

  it("opens Budget top-level in a new tab on Safari", () => {
    scopeEl.dataset.ui = "phone";
    const open = jest.spyOn(window, "open").mockReturnValue(null);
    act(() => root.render(h(BudgetFrame)));
    wait(9_000);
    act(() => {
      host.querySelector<HTMLButtonElement>("[data-bd-fallback-open]")!.click();
    });
    expect(open).toHaveBeenCalledWith(
      `${BUDGET_ORIGIN}/dashboard`,
      "_blank",
      "noopener"
    );
  });

  it("never shows once Budget has said it is ready", () => {
    scopeEl.dataset.ui = "phone";
    act(() => root.render(h(BudgetFrame)));
    ready();
    wait(9_000);
    expect(fallback()).toBeNull();
  });

  it("ignores a ready message from another origin", () => {
    scopeEl.dataset.ui = "phone";
    act(() => root.render(h(BudgetFrame)));
    ready("https://evil.example");
    wait(9_000);
    expect(fallback()).not.toBeNull();
  });

  it("leaves a desktop frame alone until Budget is known to send ready", () => {
    act(() => root.render(h(BudgetFrame)));
    wait(9_000);
    expect(fallback()).toBeNull();
  });

  it("on desktop, shows when Budget has sent ready before and now is silent", () => {
    act(() => root.render(h(BudgetFrame)));
    ready();
    act(() => root.unmount());
    root = createRoot(host);
    act(() => root.render(h(BudgetFrame)));
    wait(9_000);
    expect(fallback()).not.toBeNull();
  });
});
