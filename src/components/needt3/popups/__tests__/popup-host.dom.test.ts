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
jest.mock("../gate", () => ({
  canShowPopup: () => free,
  markPopupShown: jest.fn(),
  popupContext: () => ({}),
  popupPlatform: () => "web",
}));
jest.mock("../PopupCard", () => ({
  PopupCard: ({ popup, open }: { popup: { title: string }; open: boolean }) =>
    open ? h("div", { "data-popup-card": "" }, popup.title) : null,
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => ({ data: undefined }),
}));
jest.mock("@/lib/needt3/pricing", () => ({ priceStrings: () => ({}) }));
jest.mock("@/lib/needt3/student-prices", () => ({
  showsStudentPrices: () => false,
}));
jest.mock("@/lib/use-store-distribution", () => ({
  useStoreDistribution: () => false,
}));
jest.mock("@/lib/version", () => ({ getAppVersion: () => "1.0.0" }));
jest.mock("../../root/phone-ui-context", () => ({
  usePhoneUi: () => "desktop",
}));
jest.mock("../../paywall/store", () => ({ openPaywall: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const popup: PopupView = {
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
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/popups/next")) {
      // The page opens a dialog while the answer is in flight.
      free = false;
      return { ok: true, json: async () => ({ popup }) };
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
  expect(host.querySelector("[data-popup-card]")?.textContent).toBe(
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
