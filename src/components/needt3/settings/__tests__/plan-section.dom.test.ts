/**
 * @jest-environment jsdom
 *
 * Plan & billing when Creem could not collect a payment: the recovery line
 * is an alert and the portal button says where to fix it.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { failedPaymentMessage } from "@/lib/creem/failed-payment";
import type { V3Plan } from "@/lib/needt3/hooks/plan";

import { PlanPage } from "../../phone/settings/PlanPage";
import { PlanSection } from "../PlanSection";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let planData: Partial<V3Plan> | undefined;

jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => ({ data: planData }),
}));
jest.mock("@/lib/needt3/hooks/account", () => ({
  openBillingPortal: jest.fn(async () => ({ ok: true })),
  startCheckout: jest.fn(async () => ({ ok: true })),
}));
jest.mock("@/lib/needt3/hooks/promo", () => ({
  useRedeemPromo: () => jest.fn(),
}));
jest.mock("@/lib/notifications", () => ({ notify: { error: jest.fn() } }));
jest.mock("../../ctx/PortalScope", () => ({
  useV3PortalContainer: () => null,
}));
jest.mock("../../phone/settings/parts", () => ({
  ...jest.requireActual("../../phone/settings/parts"),
  usePs: () => ({ upgrade: jest.fn() }),
}));
jest.mock("../../ctx/useExit", () => ({ useExit: () => ({}) }));

const PERIOD_END = "2099-09-01T00:00:00.000Z";

function plan(overrides: Partial<V3Plan>): Partial<V3Plan> {
  return {
    configured: true,
    plan: "PRO",
    isTrial: false,
    trialEndsAt: null,
    status: "ACTIVE",
    interval: "month",
    currentPeriodEnd: PERIOD_END,
    cancelAtPeriodEnd: false,
    canManageBilling: true,
    lifetimeAvailable: true,
    kind: "monthly",
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
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(face: typeof PlanSection | typeof PlanPage = PlanSection) {
  act(() => root.render(h(face)));
}

function buttonLabels() {
  return Array.from(host.querySelectorAll("button")).map(
    (b) => b.textContent?.trim() ?? ""
  );
}

it("shows the failed-payment alert and labels the portal button Manage billing", () => {
  planData = plan({ status: "PAYMENT_FAILED", paymentFailed: true });
  render();

  const alert = host.querySelector('[role="alert"]');
  expect(alert?.textContent).toBe(
    failedPaymentMessage({ effectivePlan: "PRO", currentPeriodEnd: PERIOD_END })
  );
  expect(alert?.textContent).toContain("Creem could not collect this payment.");
  expect(buttonLabels()).toContain("Manage billing");
  expect(buttonLabels()).not.toContain("Invoices and payment");
});

it("treats a non-paid plan as FREE in the recovery line", () => {
  planData = plan({
    plan: "FREE",
    kind: "free",
    status: "PAST_DUE",
    paymentFailed: true,
  });
  render();

  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    failedPaymentMessage({
      effectivePlan: "FREE",
      currentPeriodEnd: PERIOD_END,
    })
  );
});

it("keeps Invoices and payment and no alert while payment is fine", () => {
  planData = plan({});
  render();

  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(buttonLabels()).toContain("Invoices and payment");
  expect(buttonLabels()).not.toContain("Manage billing");
});

it("the phone's Plan page shows the same alert and Manage billing", () => {
  planData = plan({ status: "PAYMENT_FAILED", paymentFailed: true });
  render(PlanPage);

  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    failedPaymentMessage({ effectivePlan: "PRO", currentPeriodEnd: PERIOD_END })
  );
  expect(host.textContent).toContain("Manage billing");
  expect(host.textContent).not.toContain("Invoices and payment");
});

it("the phone's Plan page keeps Invoices and payment while payment is fine", () => {
  planData = plan({});
  render(PlanPage);

  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.textContent).toContain("Invoices and payment");
});
