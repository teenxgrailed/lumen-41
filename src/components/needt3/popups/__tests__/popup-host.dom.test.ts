/**
 * @jest-environment jsdom
 *
 * PopupHost after the server started claiming the show in /api/popups/next:
 * a popup that arrives while a dialog or focus is in the way waits and is
 * drawn when the page is free; if the page closes first, the claim is
 * released instead of being used up unseen.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { PopupView } from "@/lib/popups/types";

import { PopupHost } from "../PopupHost";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let free = true;
/** Legacy cases: a dialog opens while the answer is in flight. */
let racing = true;
let mockStore = false;
let mockPlan: { lifetimeAvailable?: boolean; trialEligible?: boolean } = {};
const mockPush = jest.fn();
const mockOpenPaywall = jest.fn();

jest.mock("../gate", () => ({
  canShowPopup: () => free,
  markPopupShown: jest.fn(),
  popupContext: () => ({}),
  popupPlatform: () => "web",
}));
// The styled popups are checked on their own (presentational); here the host's
// job is the mapping, so each stub prints the props it was given.
jest.mock("../WhatsNewPopup", () => ({
  WhatsNewPopup: (p: {
    open: boolean;
    kind: string;
    badge?: string;
    title: string;
    body?: string;
    items: { glyph: string; text: string }[];
    primary?: { label: string; onClick: () => void };
    secondaryLabel?: string;
    onSecondary: () => void;
    artNode?: unknown;
    art: { glyph: string };
  }) =>
    p.open
      ? h(
          "div",
          {
            "data-popup-card": "",
            "data-whatsnew": "",
            "data-kind": p.kind,
            "data-badge": p.badge ?? "",
            "data-body": p.body ?? "",
            "data-items": p.items.map((i) => `${i.glyph}:${i.text}`).join("|"),
            "data-has-image": p.artNode ? "1" : "0",
            "data-art-glyph": p.art.glyph,
          },
          p.title,
          p.primary
            ? h(
                "button",
                { "data-primary": "", onClick: p.primary.onClick },
                p.primary.label
              )
            : null,
          h(
            "button",
            { "data-secondary": "", onClick: p.onSecondary },
            p.secondaryLabel ?? "(default)"
          )
        )
      : null,
}));
jest.mock("../UpsellPopup", () => ({
  UpsellPopup: (p: {
    open: boolean;
    title: string;
    body: string;
    dismissLabel?: string;
    onClose: () => void;
    cards: {
      key: string;
      cta: string;
      primary?: boolean;
      onSelect: () => void;
    }[];
  }) =>
    p.open
      ? h(
          "div",
          { "data-popup-card": "", "data-upsell": "", "data-body": p.body },
          p.title,
          ...p.cards.map((c) =>
            h(
              "button",
              {
                key: c.key,
                "data-card": c.key,
                "data-primary-card": c.primary ? "1" : "0",
                onClick: c.onSelect,
              },
              c.cta
            )
          ),
          p.dismissLabel
            ? h(
                "button",
                { "data-dismiss": "", onClick: p.onClose },
                p.dismissLabel
              )
            : null
        )
      : null,
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => ({ data: mockPlan }),
}));
jest.mock("@/lib/needt3/student-prices", () => ({
  showsStudentPrices: () => false,
}));
jest.mock("@/lib/use-store-distribution", () => ({
  useStoreDistribution: () => mockStore,
}));
jest.mock("@/lib/version", () => ({ getAppVersion: () => "1.0.0" }));
jest.mock("../../paywall/store", () => ({
  openPaywall: (...args: unknown[]) => mockOpenPaywall(...args),
}));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const trialPopup: PopupView = {
  id: "moment:trial:trial:1d",
  source: "trial",
  key: "trial:1d",
  kind: "trial",
  badge: "Trial",
  title: "Your trial ends tomorrow",
  body: "",
  bullets: [],
  imageUrl: null,
  primary: null,
  secondary: "Not now",
  cards: [],
  feature: null,
};
let served: PopupView = trialPopup;

const fetchMock = jest.fn();
let root: Root;
let host: HTMLDivElement;

/** Every POST to the event endpoint, as `{ id, event }`. */
const events = () =>
  fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")
    .map(([url, init]) => ({
      url: String(url),
      event: JSON.parse(String((init as RequestInit).body)).event,
    }));

beforeEach(() => {
  jest.useFakeTimers();
  free = true;
  racing = true;
  mockStore = false;
  mockPlan = {};
  served = trialPopup;
  mockPush.mockReset();
  mockOpenPaywall.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/popups/next")) {
      // The page opens a dialog while the answer is in flight.
      if (racing) free = false;
      return { ok: true, json: async () => ({ popup: served }) };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  });
  (globalThis as { fetch: unknown }).fetch = fetchMock;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(PopupHost)));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});

async function firstCheck() {
  await act(async () => {
    jest.advanceTimersByTime(5_000);
  });
  // let the fetch promise chain settle
  await act(async () => {
    await Promise.resolve();
  });
}

it("keeps a claimed popup waiting while a dialog is open, then draws it", async () => {
  await firstCheck();
  expect(host.querySelector("[data-popup-card]")).toBeNull();
  expect(events()).toEqual([]);

  free = true;
  await act(async () => {
    jest.advanceTimersByTime(1_000);
  });
  expect(host.querySelector("[data-popup-card]")?.textContent).toContain(
    "Your trial ends tomorrow"
  );
  expect(events()).toEqual([
    {
      url: "/api/popups/moment%3Atrial%3Atrial%3A1d/event",
      event: "shown",
    },
  ]);
});

it("releases the claim when the page closes before it could be drawn", async () => {
  await firstCheck();
  expect(host.querySelector("[data-popup-card]")).toBeNull();

  act(() => {
    window.dispatchEvent(new Event("pagehide"));
  });
  expect(events()).toEqual([
    {
      url: "/api/popups/moment%3Atrial%3Atrial%3A1d/event",
      event: "release",
    },
  ]);
});

it("does not ask for another popup while one is waiting", async () => {
  await firstCheck();
  const asks = () =>
    fetchMock.mock.calls.filter(([url]) =>
      String(url).startsWith("/api/popups/next")
    ).length;
  expect(asks()).toBe(1);
  await act(async () => {
    window.dispatchEvent(
      new CustomEvent("needt:popup-limit-hit", { detail: { limit: "habits" } })
    );
  });
  expect(asks()).toBe(1);
});

it("never asks for a popup in an automated browser (e2e, visual runs)", async () => {
  Object.defineProperty(navigator, "webdriver", {
    value: true,
    configurable: true,
  });
  try {
    await firstCheck();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.querySelector("[data-popup-card]")).toBeNull();
  } finally {
    Object.defineProperty(navigator, "webdriver", {
      value: false,
      configurable: true,
    });
  }
});

describe("the styled popups", () => {
  beforeEach(() => {
    racing = false;
  });

  const card = () => host.querySelector<HTMLElement>("[data-popup-card]");
  const click = (selector: string) =>
    act(() => {
      host
        .querySelector<HTMLElement>(selector)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

  const announcement: PopupView = {
    id: "ann-plan-my-day",
    source: "announcement",
    key: "ann-plan-my-day",
    kind: "tip",
    badge: "Tip",
    title: "Plan your day in one tap",
    body: "Plan my day reads your calendar and your habits together.",
    bullets: [
      { icon: "calendar", text: "Tasks fit around meetings" },
      { icon: "repeat", text: "Habits keep their usual time" },
      { icon: "zap", text: "Start Focus from the plan" },
    ],
    imageUrl: "https://needt.app/shot.png",
    primary: { label: "Plan my day", href: "/today" },
    secondary: "Later",
    cards: [],
    feature: null,
  };

  const limit: PopupView = {
    id: "moment:limit:limit:habits",
    source: "limit",
    key: "limit:habits",
    kind: "limit",
    badge: "Free plan",
    title: "Need more habits?",
    body: "Free keeps 3 active habits. Pro and Lifetime have no limit.",
    bullets: [],
    imageUrl: null,
    primary: null,
    secondary: "Not now",
    cards: [
      { plan: "pro", pick: "annual" },
      { plan: "lifetime", pick: "lifetime" },
    ],
    feature: "Habits",
  };

  it("draws an announcement as WhatsNewPopup, field by field", async () => {
    served = announcement;
    await firstCheck();
    const el = card()!;
    expect(el.hasAttribute("data-whatsnew")).toBe(true);
    expect(el.hasAttribute("data-upsell")).toBe(false);
    expect(el.dataset.kind).toBe("tip");
    expect(el.dataset.badge).toBe("Tip");
    expect(el.dataset.body).toBe(announcement.body);
    expect(el.dataset.items).toBe(
      "calendar:Tasks fit around meetings|habits:Habits keep their usual time|focus:Start Focus from the plan"
    );
    expect(el.dataset.hasImage).toBe("1");
    expect(el.querySelector("[data-primary]")?.textContent).toBe("Plan my day");
    expect(el.querySelector("[data-secondary]")?.textContent).toBe("Later");
    expect(el.textContent).toContain("Plan your day in one tap");
  });

  it("the primary button follows its link and reports a click", async () => {
    served = announcement;
    await firstCheck();
    await click("[data-primary]");
    expect(mockPush).toHaveBeenCalledWith("/today");
    expect(events().map((e) => e.event)).toEqual(["shown", "click"]);
  });

  it("the quiet button only dismisses", async () => {
    served = announcement;
    await firstCheck();
    await click("[data-secondary]");
    expect(mockPush).not.toHaveBeenCalled();
    expect(events().map((e) => e.event)).toEqual(["shown", "dismiss"]);
  });

  it("an announcement with nowhere to send people has no primary button", async () => {
    served = { ...announcement, primary: null, imageUrl: null };
    await firstCheck();
    expect(card()?.hasAttribute("data-whatsnew")).toBe(true);
    expect(card()?.querySelector("[data-primary]")).toBeNull();
    expect(card()?.dataset.hasImage).toBe("0");
  });

  it("draws a limit as UpsellPopup: trial first, Lifetime second, the server's words", async () => {
    mockPlan = { trialEligible: true, lifetimeAvailable: true };
    served = limit;
    await firstCheck();
    const el = card()!;
    expect(el.hasAttribute("data-upsell")).toBe(true);
    expect(el.textContent).toContain("Need more habits?");
    expect(el.dataset.body).toBe(limit.body);
    const keys = [...el.querySelectorAll("[data-card]")].map(
      (c) => (c as HTMLElement).dataset.card
    );
    expect(keys).toEqual(["trial", "lifetime"]);
    expect(el.querySelector("[data-dismiss]")?.textContent).toBe("Not now");
  });

  it("a plan card closes the popup and opens the paywall on its pick", async () => {
    mockPlan = { trialEligible: true };
    served = limit;
    await firstCheck();
    await click('[data-card="lifetime"]');
    expect(mockOpenPaywall).toHaveBeenCalledWith({
      cycle: "lifetime",
      feature: "Habits",
    });
    expect(events().map((e) => e.event)).toEqual(["shown", "click"]);
  });

  it("the first card opens the annual plan; without a trial it says so", async () => {
    mockPlan = { trialEligible: false };
    served = limit;
    await firstCheck();
    expect(card()?.querySelector('[data-card="plans"]')?.textContent).toBe(
      "See plans"
    );
    await click('[data-card="plans"]');
    expect(mockOpenPaywall).toHaveBeenCalledWith({
      cycle: "annual",
      feature: "Habits",
    });
  });

  it("drops the Lifetime card once the seats are gone", async () => {
    mockPlan = { trialEligible: true, lifetimeAvailable: false };
    served = limit;
    await firstCheck();
    expect(
      [...card()!.querySelectorAll("[data-card]")].map(
        (c) => (c as HTMLElement).dataset.card
      )
    ).toEqual(["trial"]);
  });

  it("draws a trial ending as UpsellPopup; Stay on Free dismisses", async () => {
    served = trialPopup;
    await firstCheck();
    expect(card()?.hasAttribute("data-upsell")).toBe(true);
    expect(card()?.textContent).toContain("Your trial ends tomorrow");
    await click('[data-card="free"]');
    expect(mockOpenPaywall).not.toHaveBeenCalled();
    expect(events().map((e) => e.event)).toEqual(["shown", "dismiss"]);
  });

  it("Keep Pro on a trial opens the annual paywall", async () => {
    served = trialPopup;
    await firstCheck();
    await click('[data-card="keep"]');
    expect(mockOpenPaywall).toHaveBeenCalledWith({
      cycle: "annual",
      feature: null,
    });
  });

  it("a trial that already ended says so", async () => {
    served = {
      ...trialPopup,
      id: "moment:trial:trial:ended",
      key: "trial:ended",
      title: "Your trial has ended",
    };
    await firstCheck();
    expect(card()?.textContent).toContain("Your trial has ended");
    expect(card()?.dataset.body).toContain("You are on Free now");
  });

  it("a store build points at no plan: the moment is plain text, one button", async () => {
    mockStore = true;
    served = limit;
    await firstCheck();
    const el = card()!;
    expect(el.hasAttribute("data-whatsnew")).toBe(true);
    expect(el.querySelector("[data-card]")).toBeNull();
    expect(el.querySelector("[data-primary]")).toBeNull();
    expect(el.dataset.badge).toBe("Free plan");
  });
});
