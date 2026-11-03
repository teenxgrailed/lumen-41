/**
 * @jest-environment jsdom
 *
 * The account menu in a store build (iOS app, Mac App Store): a Free account
 * sees no "Upgrade", a paid one sees "Plan" instead of "Manage", and the Help
 * row (a link to the website) is gone. The browser keeps all three.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { V3Plan } from "@/lib/needt3/hooks/plan";

import { AccountMenu } from "../AccountMenu";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let planData: Partial<V3Plan> | undefined;

jest.mock("next-auth/react", () => ({
  signOut: jest.fn(),
  useSession: () => ({
    data: { user: { name: "Test Person", email: "test@example.com" } },
  }),
}));
jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => ({ data: planData }),
}));
jest.mock("@/lib/needt3/hooks/whats-new", () => ({
  useWhatsNewUnseen: () => false,
}));
jest.mock("@/lib/notifications", () => ({
  notify: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));
jest.mock("../../ctx/PortalScope", () => ({
  useV3PortalContainer: () => document.body,
}));
jest.mock("../../ctx/useExit", () => ({
  useExit: (open: boolean) => [open, false],
}));
jest.mock("../ShellContext", () => ({
  useShellApi: () => ({ openWhatsNew: jest.fn(), openShortcuts: jest.fn() }),
}));

const STORE = { platform: "mac-swift", distribution: "appstore" };

function plan(kind: V3Plan["kind"]): Partial<V3Plan> {
  return {
    configured: true,
    kind,
    plan: kind === "free" ? "FREE" : "PRO",
    trialDaysLeft: kind === "trial" ? 9 : null,
  };
}

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
  delete (window as unknown as { __needtNative?: unknown }).__needtNative;
});

function openMenu() {
  act(() => root.render(h(AccountMenu)));
  act(() => {
    host.querySelector<HTMLButtonElement>("button.sb-profile")!.click();
  });
  return document.body.querySelector<HTMLElement>("[role=menu]")!;
}

const labels = (menu: HTMLElement) =>
  Array.from(menu.querySelectorAll("button,a")).map((b) =>
    (b.textContent ?? "").trim()
  );

describe("AccountMenu", () => {
  it("store build, Free: no Upgrade button, no Help, no link out", () => {
    (window as unknown as { __needtNative?: unknown }).__needtNative = STORE;
    planData = plan("free");
    const menu = openMenu();
    const all = labels(menu).join(" | ");
    expect(all).not.toMatch(/upgrade|get pro|see plans|help/i);
    expect(menu.querySelector("[class*=sb-acct-plan-btn]")).toBeNull();
    expect(menu.querySelector("a[href]")).toBeNull();
    // the plan pill still names the plan, with no price
    expect(host.querySelector("[data-sb-plan-pill]")!.textContent).toBe("Free");
    // the rest of the menu is intact
    expect(all).toMatch(/Settings/);
    expect(all).toMatch(/Sign out/);
  });

  it("store build, paid: the plan button reads Plan, not Manage", () => {
    (window as unknown as { __needtNative?: unknown }).__needtNative = STORE;
    planData = plan("monthly");
    const menu = openMenu();
    const btn = menu.querySelector<HTMLElement>(".sb-acct-plan-btn")!;
    expect(btn.textContent).toBe("Plan");
    expect(labels(menu).join(" | ")).not.toMatch(/manage|upgrade|help/i);
  });

  it("browser, Free: Upgrade and Help are still there", () => {
    planData = plan("free");
    const menu = openMenu();
    const all = labels(menu).join(" | ");
    expect(all).toMatch(/Upgrade/);
    expect(all).toMatch(/Help/);
  });

  it("browser, paid: the plan button reads Manage", () => {
    planData = plan("monthly");
    const menu = openMenu();
    expect(menu.querySelector(".sb-acct-plan-btn")!.textContent).toBe("Manage");
  });
});
