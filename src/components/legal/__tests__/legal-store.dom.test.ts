/**
 * @jest-environment jsdom
 *
 * /terms in a store build (iOS app, Mac App Store): the plans, prices and
 * free-trial sections are one neutral sentence; the rest of the document is
 * unchanged. A browser reads the full text. /privacy is the same in both.
 *
 * With Apple In-App Purchase on (the iOS app, the NeedtStore plugin, and the
 * server listing products) the neutral sentence would be false: the App Store
 * subsection (5.7) takes its place. A browser shows the web text and 5.7.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { privacyMarkdown } from "@/lib/legal/documents/privacy";
import { termsMarkdown } from "@/lib/legal/documents/terms";

import { LegalDocument } from "../LegalDocument";
import { STORE_PLANS_NOTICE } from "../WebOnly";

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
  delete (window as unknown as { __needtNative?: unknown }).__needtNative;
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  jest.restoreAllMocks();
});

const asStore = () => {
  (window as unknown as { __needtNative?: unknown }).__needtNative = {
    platform: "mac-swift",
    distribution: "appstore",
  };
};
const render = (markdown: string) =>
  act(() => root.render(h(LegalDocument, { markdown })));

const APP_STORE_HEADING = "5-7-purchases-in-the-app-store";
const WEB_PRICES = /\$\s?\d|per month|per year|Free trial/;

/** The iOS app: Capacitor on ios, with a NeedtStore plugin that knows products. */
const asIosApp = () => {
  (window as unknown as { Capacitor?: unknown }).Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "ios",
    Plugins: {
      NeedtStore: {
        products: async ({ ids }: { ids: string[] }) => ({
          products: ids.map((id) => ({ id, displayPrice: "CHF 7.00" })),
        }),
      },
    },
  };
};

/** What GET /api/billing/apple/account-token answers. */
const serverAnswers = (enabled: boolean, products: string[]) => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ appAccountToken: "t", enabled, products }),
  })) as unknown as typeof fetch;
};

const settle = () => act(async () => void (await Promise.resolve()));

describe("/terms", () => {
  it("browser: the full plans, prices and trial", () => {
    render(termsMarkdown());
    expect(host.textContent).toContain("$7 per month");
    expect(host.textContent).toContain("Lifetime:");
    expect(host.textContent).toContain("Free trial");
    expect(host.textContent).not.toContain(STORE_PLANS_NOTICE);
  });

  it("browser: the web section 5 and the App Store subsection together", () => {
    render(termsMarkdown());
    const text = host.textContent ?? "";
    expect(host.querySelector("[id='5-1-plans']")).not.toBeNull();
    expect(
      host.querySelector("[id='5-3-who-sells-to-you-creem']")
    ).not.toBeNull();
    expect(host.querySelector(`[id="${APP_STORE_HEADING}"]`)).not.toBeNull();
    expect(text).toContain("Apple is the seller");
    expect(text).toContain("reportaproblem.apple.com");
    expect(text).toContain("Settings → Apple ID → Subscriptions");
    expect(text).toContain(
      "Needt cannot refund or reverse an App Store purchase"
    );
    expect(text).toContain("Licensed Application End User License Agreement");
    expect(text).toContain("still billing as well");
  });

  it("store build: one neutral sentence in place of 5.1 and 5.2", () => {
    asStore();
    render(termsMarkdown());
    const text = host.textContent ?? "";
    expect(text).toContain(STORE_PLANS_NOTICE);
    expect(text).not.toMatch(/\$\s?\d|per month|per year|Free trial/);
    expect(host.querySelector("[id='5-1-plans']")).toBeNull();
    expect(host.querySelector("[id='5-2-free-trial']")).toBeNull();
    expect(host.querySelector(`[id="${APP_STORE_HEADING}"]`)).toBeNull();
    expect(text).not.toContain("Apple is the seller");
  });

  it("store build without IAP (flag off): the old sentence, no App Store subsection", async () => {
    asIosApp();
    serverAnswers(false, []);
    render(termsMarkdown());
    await settle();
    const text = host.textContent ?? "";
    expect(text).toContain(STORE_PLANS_NOTICE);
    expect(host.querySelector(`[id="${APP_STORE_HEADING}"]`)).toBeNull();
    expect(text).not.toContain("Apple is the seller");
    expect(text).not.toMatch(WEB_PRICES);
  });

  it("store build without IAP (server lists no products): the old sentence", async () => {
    asIosApp();
    serverAnswers(true, []);
    render(termsMarkdown());
    await settle();
    expect(host.textContent).toContain(STORE_PLANS_NOTICE);
    expect(host.querySelector(`[id="${APP_STORE_HEADING}"]`)).toBeNull();
  });

  it("Mac App Store build (no StoreKit bridge): the old sentence", async () => {
    asStore();
    serverAnswers(true, ["app.needt.pro.monthly"]);
    render(termsMarkdown());
    await settle();
    expect(host.textContent).toContain(STORE_PLANS_NOTICE);
    expect(host.querySelector(`[id="${APP_STORE_HEADING}"]`)).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("iOS app with the NeedtStore plugin missing: the old sentence", async () => {
    (window as unknown as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
      Plugins: {},
    };
    serverAnswers(true, ["app.needt.pro.monthly"]);
    render(termsMarkdown());
    await settle();
    expect(host.textContent).toContain(STORE_PLANS_NOTICE);
    expect(host.querySelector(`[id="${APP_STORE_HEADING}"]`)).toBeNull();
  });

  it("store build with the purchase sheet available: the App Store subsection, no web buying text", async () => {
    asIosApp();
    serverAnswers(true, ["app.needt.pro.monthly", "app.needt.lifetime"]);
    render(termsMarkdown());
    await settle();
    const text = host.textContent ?? "";
    expect(host.querySelector(`[id="${APP_STORE_HEADING}"]`)).not.toBeNull();
    expect(text).toContain("Apple is the seller");
    expect(text).toContain("reportaproblem.apple.com");
    expect(text).not.toContain(STORE_PLANS_NOTICE);
    // no prices, no trial, no web plans or the website checkout path
    expect(text).not.toMatch(WEB_PRICES);
    expect(host.querySelector("[id='5-1-plans']")).toBeNull();
    expect(host.querySelector("[id='5-2-free-trial']")).toBeNull();
    expect(text).not.toContain("Plan & billing → Invoices and payment");
    expect(text).not.toContain("Creem");
    expect(host.querySelector("[id='5-3-who-sells-to-you-creem']")).toBeNull();
    expect(
      host.querySelector("[id='5-5-refunds-and-the-right-of-withdrawal']")
    ).toBeNull();
    expect(host.querySelector("a[href='https://needt.app']")).toBeNull();
  });

  it("store build: the rest of the document stays, including sections 5 and 6", () => {
    asStore();
    render(termsMarkdown());
    for (const id of [
      "5-plans-trial-and-payment",
      "5-3-who-sells-to-you-creem",
      "5-5-refunds-and-the-right-of-withdrawal",
      "6-ai-features-and-fair-use",
    ]) {
      expect(host.querySelector(`[id="${id}"]`)).not.toBeNull();
    }
    expect(host.querySelector("a[href='https://needt.app']")).toBeNull();
  });
});

describe("/privacy", () => {
  it("keeps the processor disclosure in a store build", () => {
    asStore();
    render(privacyMarkdown());
    expect(host.textContent).toContain("Creem");
    expect(host.textContent).not.toContain(STORE_PLANS_NOTICE);
  });
});
