/**
 * @jest-environment jsdom
 *
 * The loading word covers the Budget frame from mount until the frame's load
 * event, and is lifted after 20 s even if Budget never reports loading.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

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

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});

const word = () => host.querySelector("[data-needt-loading]");

describe("Budget frame overlay", () => {
  it("is up while the frame loads and removed on its load event", () => {
    act(() => root.render(h(BudgetFrame)));
    expect(word()).not.toBeNull();
    const frame = host.querySelector("iframe")!;
    act(() => {
      frame.dispatchEvent(new Event("load"));
    });
    expect(word()).toBeNull();
  });

  it("is removed after 20 s when the frame never reports loading", () => {
    act(() => root.render(h(BudgetFrame)));
    act(() => {
      jest.advanceTimersByTime(19_000);
    });
    expect(word()).not.toBeNull();
    act(() => {
      jest.advanceTimersByTime(1_500);
    });
    expect(word()).toBeNull();
  });
});
