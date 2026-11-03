/**
 * @jest-environment jsdom
 *
 * Store distribution (iOS app, Mac App Store): the paywall, the Plan section
 * and the Plan page render no price, checkout, upgrade or link to the website.
 * Detection is the real one (`window.__needtNative`), not a mock of
 * `@/lib/native`. The browser case keeps its purchase screens.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { LegalHomeLink } from "@/components/legal/LegalHomeLink";

import type { V3Plan } from "@/lib/needt3/hooks/plan";

import { PkPaywall } from "../../phone/overlays/Paywall";
import { PlanPage } from "../../phone/settings/PlanPage";
import { PlanSection } from "../../settings/PlanSection";
import { Paywall } from "../Paywall";
import { ProUpsell } from "../Pro";
import { PromoCard } from "../PromoCard";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let planData: Partial<V3Plan> | undefined;

jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => ({ data: planData, refetch: jest.fn() }),
}));
jest.mock("@/lib/needt3/hooks/account", () => ({
  openBillingPortal: jest.fn(async () => ({ ok: true })),
  startCheckout: jest.fn(async () => ({ ok: true })),
  startTrial: jest.fn(async () => ({ ok: true })),
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useSettings: () => ({ data: { prefs: {} } }),
  useSetPref: () => jest.fn(async () => undefined),
}));
jest.mock("@/lib/notifications", () => ({
  notify: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));
jest.mock("../../ctx/PortalScope", () => ({
  useV3PortalContainer: () => null,
}));
jest.mock("../../ctx/useExit", () => ({ useExit: () => ({}) }));
jest.mock("../../phone/settings/parts", () => ({
  ...jest.requireActual("../../phone/settings/parts"),
  usePs: () => ({ upgrade: jest.fn() }),
}));

const STORE = { platform: "mac-swift", distribution: "appstore" };

/** Words and shapes that sell something. None may render in a store build. */
const SELLING =
  /upgrade|see plans|get pro|try pro|choose a plan|compare plans|switch to yearly|checkout|manage billing|invoices|free trial|start .* trial|one-time|\bsave\b|[$€£]\s?\d|\bCHF\b|\/ ?(month|year|mo)\b|per (month|year)|creem|pricing/i;

function plan(overrides: Partial<V3Plan>): Partial<V3Plan> {
  return {
    configured: true,
    plan: "FREE",
    isTrial: false,
    trialEndsAt: null,
    status: undefined,
    interval: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    canManageBilling: false,
    lifetimeAvailable: true,
    trialEligible: true,
    kind: "free",
    trialDaysLeft: null,
    paymentFailed: false,
    ...overrides,
  };
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  planData = plan({});
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (window as unknown as { __needtNative?: unknown }).__needtNative;
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
});

const asMacAppStore = () => {
  (window as unknown as { __needtNative?: unknown }).__needtNative = STORE;
};
const asIos = () => {
  (window as unknown as { Capacitor?: unknown }).Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "ios",
  };
};

function render(node: Parameters<Root["render"]>[0]) {
  act(() => root.render(node));
}

/** Everything a person could read or follow, in the page body. */
function surface() {
  const body = document.body;
  return {
    text: body.textContent ?? "",
    hrefs: Array.from(body.querySelectorAll("a[href]")).map((a) =>
      a.getAttribute("href")
    ),
    actions: Array.from(body.querySelectorAll("button,[role=button]")).map(
      (b) => (b.textContent ?? "").trim()
    ),
  };
}

function expectNoPurchaseUi() {
  const s = surface();
  expect(s.text).not.toMatch(SELLING);
  expect(
    s.hrefs.filter((x) => /needt\.app|checkout|pricing/i.test(x ?? ""))
  ).toEqual([]);
  for (const a of s.actions) expect(a).not.toMatch(SELLING);
}

describe("paywall in a store build", () => {
  const props = { open: true, onClose: jest.fn(), feature: "Plan my day" };

  it("desktop sheet in the Mac App Store build: one sentence and Close", () => {
    asMacAppStore();
    render(h(Paywall, props));
    expect(document.body.textContent).toContain("This is part of Needt Pro.");
    expect(surface().actions).toEqual(["Close"]);
    expect(document.body.querySelector("a")).toBeNull();
    expectNoPurchaseUi();
  });

  it("desktop sheet inside the iOS app", () => {
    asIos();
    render(h(Paywall, props));
    expect(surface().actions).toEqual(["Close"]);
    expectNoPurchaseUi();
  });

  it("Close calls onClose", () => {
    asMacAppStore();
    const onClose = jest.fn();
    render(h(Paywall, { ...props, onClose }));
    const close = document.body.querySelector<HTMLButtonElement>(
      "button[data-pw-close]"
    )!;
    act(() => close.click());
    expect(onClose).toHaveBeenCalled();
  });

  it("phone sheet inside the iOS app: one sentence and Close", () => {
    asIos();
    render(h(PkPaywall, props));
    expect(document.body.textContent).toContain("This is part of Needt Pro.");
    expect(surface().actions).toEqual(expect.arrayContaining(["Close"]));
    expect(document.body.querySelector("a")).toBeNull();
    expectNoPurchaseUi();
  });

  it("the soft upsell and the promo card render nothing", () => {
    asIos();
    render(
      h(
        "div",
        null,
        h(ProUpsell, {
          id: "boards",
          feature: "Boards",
          title: "Unlimited boards",
          line: "Free keeps one board.",
          cta: "Try Pro free",
        }),
        h(PromoCard, null)
      )
    );
    expect(host.textContent).toBe("");
  });

  it("the same upsell and promo do render in a browser (the test is not vacuous)", () => {
    render(
      h(
        "div",
        null,
        h(ProUpsell, {
          id: "boards",
          feature: "Boards",
          title: "Unlimited boards",
          line: "Free keeps one board.",
          cta: "Try Pro free",
        }),
        h(PromoCard, null)
      )
    );
    expect(host.querySelector("[data-pro-upsell]")).not.toBeNull();
  });
});

describe("Plan section and Plan page in a store build", () => {
  const cases: Array<[string, Partial<V3Plan>]> = [
    ["free", plan({})],
    [
      "trial",
      plan({ plan: "PRO", isTrial: true, kind: "trial", trialDaysLeft: 9 }),
    ],
    [
      "monthly",
      plan({
        plan: "PRO",
        kind: "monthly",
        status: "ACTIVE",
        interval: "month",
        currentPeriodEnd: "2099-09-01T00:00:00.000Z",
        canManageBilling: true,
      }),
    ],
    [
      "monthly, payment failed",
      plan({
        plan: "PRO",
        kind: "monthly",
        status: "PAST_DUE",
        interval: "month",
        currentPeriodEnd: "2099-09-01T00:00:00.000Z",
        canManageBilling: true,
        paymentFailed: true,
      }),
    ],
    [
      "lifetime",
      plan({ plan: "PRO", kind: "lifetime", canManageBilling: true }),
    ],
  ];

  it.each(cases)("PlanSection (%s) has no purchase UI", (_name, data) => {
    asMacAppStore();
    planData = data;
    render(h(PlanSection));
    expect(host.textContent).toContain("Plan");
    expectNoPurchaseUi();
    expect(host.querySelector("[data-settings-portal]")).toBeNull();
  });

  it.each(cases)("PlanPage (%s) has no purchase UI", (_name, data) => {
    asIos();
    planData = data;
    render(h(PlanPage));
    expect(host.textContent).toContain("Your plan");
    expectNoPurchaseUi();
    expect(host.querySelector("[data-ps-portal]")).toBeNull();
    expect(host.querySelector("[data-ps-see-plans]")).toBeNull();
    expect(host.querySelector("[data-ps-start-trial]")).toBeNull();
  });
});

describe("the browser keeps its purchase screens", () => {
  it("PlanPage on Free still offers plans", () => {
    render(h(PlanPage));
    expect(host.querySelector("[data-ps-see-plans]")).not.toBeNull();
    expect(host.textContent).toMatch(SELLING);
  });

  it("a direct-download Mac build (distribution: direct) is not a store build", () => {
    (window as unknown as { __needtNative?: unknown }).__needtNative = {
      platform: "mac-swift",
      distribution: "direct",
    };
    render(h(PlanPage));
    expect(host.querySelector("[data-ps-see-plans]")).not.toBeNull();
  });
});

describe("legal page header", () => {
  it("links to the website in a browser, and nowhere in a store build", () => {
    render(h(LegalHomeLink));
    expect(host.querySelector("a[href='https://needt.app']")).not.toBeNull();
    asMacAppStore();
    render(h(LegalHomeLink));
    expect(host.querySelector("a")).toBeNull();
    expect(host.textContent).toBe("Needt");
  });
});
