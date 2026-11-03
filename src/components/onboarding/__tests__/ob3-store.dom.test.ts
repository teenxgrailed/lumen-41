/**
 * @jest-environment jsdom
 *
 * Onboarding in a store build (iOS app, Mac App Store): no plan screen, no
 * card step, no price, no waiver, no checkout. A saved link to either screen
 * lands on the end of the flow. The browser keeps both screens.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { Ob3Flow } from "../Ob3Flow";
import { checkoutAvailable, startCheckout } from "../ob3-api";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/styles/onboarding/ob3-desk.css", () => ({}));
jest.mock("@/styles/onboarding/ob3.css", () => ({}));
jest.mock("@/styles/v3-entry.css", () => ({}));
jest.mock("@/lib/needt3/fonts", () => ({ V3_FONT_CLASSES: "" }));
jest.mock("next-auth/react", () => ({ signIn: jest.fn() }));
jest.mock("../Ob3Sky", () => ({ Ob3Sky: () => null }));
jest.mock("../ob3-api", () => ({
  browserZone: () => "UTC",
  fetchPlan: jest.fn(() => new Promise(() => undefined)),
  saveAnswersRemote: jest.fn(async () => undefined),
  commitWeek: jest.fn(() => new Promise(() => undefined)),
  startGift: jest.fn(async () => ({
    ok: true,
    endsAt: "2099-01-01T00:00:00.000Z",
  })),
  checkoutAvailable: jest.fn(async () => true),
  startCheckout: jest.fn(async () => ({ ok: true })),
  signInProviders: jest.fn(async () => []),
  publicSignupOpen: jest.fn(async () => true),
  registerEmail: jest.fn(async () => ({ ok: true })),
  confirmAge: jest.fn(async () => undefined),
  emailVerified: jest.fn(async () => true),
  resendVerification: jest.fn(async () => undefined),
}));

const SESSION = { userId: "u1", verified: true, email: "a@example.com" };
const STORE = { platform: "mac-swift", distribution: "appstore" };

/** Words and shapes that sell something or ask for a card. */
const SELLING =
  /keep pro after|choose a plan|checkout|credit card|card number|nothing is charged|first charge|one-time|\bsave\b|[$€£]\s?\d|\bCHF\b|\/ ?(month|year|mo)\b|per (month|year)|withdrawal|creem|pricing|see what.s in pro/i;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  window.sessionStorage.clear();
  jest.mocked(checkoutAvailable).mockClear();
  jest.mocked(startCheckout).mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (window as unknown as { __needtNative?: unknown }).__needtNative;
});

const asStore = () => {
  (window as unknown as { __needtNative?: unknown }).__needtNative = STORE;
};

async function mount(startStep: string) {
  await act(async () => {
    root.render(h(Ob3Flow, { session: SESSION, startStep }));
  });
}

function expectNoPurchaseUi() {
  expect(host.textContent).not.toMatch(SELLING);
  expect(host.querySelector("input[type=checkbox][name*=waiver]")).toBeNull();
  const hrefs = Array.from(host.querySelectorAll("a[href]")).map((a) =>
    a.getAttribute("href")
  );
  expect(
    hrefs.filter((x) => /needt\.app|checkout|pricing/i.test(x ?? ""))
  ).toEqual([]);
}

describe("Ob3Flow", () => {
  it("store build: a saved link to the plan screen skips it", async () => {
    asStore();
    await mount("plans");
    expect(host.textContent).not.toMatch(/keep pro after/i);
    expect(host.textContent).toMatch(/Opening your week/);
    expectNoPurchaseUi();
  });

  it("store build: a saved link to the card screen skips it and starts no checkout", async () => {
    asStore();
    await mount("card");
    expect(host.textContent).toMatch(/Opening your week/);
    expectNoPurchaseUi();
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it("store build: the card step never asks whether checkout is open", async () => {
    asStore();
    await mount("card");
    expect(checkoutAvailable).not.toHaveBeenCalled();
  });

  it("browser: the card step does ask", async () => {
    await mount("card");
    expect(checkoutAvailable).toHaveBeenCalled();
  });

  it("store build: the gift screen says only what the gift is and continues", async () => {
    asStore();
    await mount("gift");
    // the gift box opens by click, then the button reads Continue
    const open = host.querySelector<HTMLElement>(".ob3-gift");
    expect(open).not.toBeNull();
    await act(async () => {
      open!.click();
    });
    expect(host.textContent).toMatch(/gift/i);
    expectNoPurchaseUi();
    const buttons = Array.from(host.querySelectorAll("button")).map((b) =>
      (b.textContent ?? "").trim()
    );
    expect(buttons.join("|")).not.toMatch(/see what.s in pro|plan|card/i);
  });

  it("browser: the plan screen still shows plans and prices", async () => {
    await mount("plans");
    expect(host.textContent).toMatch(/keep pro after/i);
    expect(host.textContent).toMatch(SELLING);
  });
});
