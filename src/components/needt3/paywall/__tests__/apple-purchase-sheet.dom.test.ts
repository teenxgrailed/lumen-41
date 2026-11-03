/**
 * @jest-environment jsdom
 *
 * The App Store purchase sheet (iOS app, NeedtStore plugin + server products),
 * its neutral fallbacks, and the App Store rows of the Plan screens. The
 * native shell is faked the way the shell does it: `window.Capacitor` with a
 * `NeedtStore` plugin; the server is a fake `fetch`.
 */
import { type ComponentType, act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import {
  type StoreProduct,
  buyWithApple,
  restoreApplePurchases,
} from "@/lib/native-store";
import {
  APPLE_OFFER_TIMEOUT_MS,
  introLine,
  perPeriod,
  useAppleTransactionUpdates,
} from "@/lib/needt3/hooks/apple-iap";
import type { V3Plan } from "@/lib/needt3/hooks/plan";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { PkPaywall } from "../../phone/overlays/Paywall";
import { PlanPage } from "../../phone/settings/PlanPage";
import { PlanSection } from "../../settings/PlanSection";
import { Paywall } from "../Paywall";

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

const TOKEN = "11111111-2222-3333-4444-555555555555";
const MONTHLY = "app.needt.pro.monthly";
const YEARLY = "app.needt.pro.yearly";
const LIFETIME = "app.needt.lifetime";

/* Deliberately odd numbers: if the sheet printed a price of its own, these
   strings would not be found. */
const PRODUCTS = [
  {
    id: YEARLY,
    displayName: "Needt Pro Yearly",
    description: "",
    displayPrice: "KRW 91,234",
    price: "91234",
    currencyCode: "KRW",
    type: "autoRenewable",
    period: { unit: "year", value: 1 },
    isFamilyShareable: false,
  },
  {
    id: MONTHLY,
    displayName: "Needt Pro Monthly",
    description: "",
    displayPrice: "KRW 9,876",
    price: "9876",
    currencyCode: "KRW",
    type: "autoRenewable",
    period: { unit: "month", value: 1 },
    isFamilyShareable: false,
  },
  {
    id: LIFETIME,
    displayName: "Needt Lifetime",
    description: "",
    displayPrice: "KRW 187,654",
    price: "187654",
    currencyCode: "KRW",
    type: "nonConsumable",
    isFamilyShareable: false,
  },
];

const TX = {
  signedTransaction: "jws.payload.sig",
  productId: YEARLY,
  transactionId: "2000000001",
};

type Json = Record<string, unknown>;
let tokenReply: { status: number; body: Json };
let postReply: { status: number; body: Json };
let fetchMock: jest.Mock;
let store: Record<string, jest.Mock>;
let removeListener: jest.Mock;
let qc: QueryClient;

function reply(r: { status: number; body: Json }) {
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    json: async () => r.body,
  };
}

function installFetch() {
  fetchMock = jest.fn(async (url: string, init?: { method?: string }) => {
    if (url.includes("/account-token")) return reply(tokenReply);
    if (url.includes("/transactions") && init?.method === "POST") {
      return reply(postReply);
    }
    return reply({ status: 404, body: {} });
  });
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
}

function installIos(withPlugin = true) {
  removeListener = jest.fn();
  store = {
    products: jest.fn(async ({ ids }: { ids: string[] }) => ({
      products: PRODUCTS.filter((p) => ids.includes(p.id)),
    })),
    purchase: jest.fn(async () => ({ status: "success", ...TX })),
    finish: jest.fn(async () => ({ finished: true })),
    restore: jest.fn(async () => ({ transactions: [TX] })),
    pendingTransactions: jest.fn(async () => ({ transactions: [] })),
    manageSubscriptions: jest.fn(async () => ({})),
    addListener: jest.fn(async () => ({ remove: removeListener })),
  };
  (window as unknown as { Capacitor?: unknown }).Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "ios",
    Plugins: withPlugin ? { NeedtStore: store } : {},
  };
}

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
  qc = new QueryClient();
  planData = plan({});
  tokenReply = {
    status: 200,
    body: {
      appAccountToken: TOKEN,
      enabled: true,
      products: [MONTHLY, YEARLY, LIFETIME],
    },
  };
  postReply = { status: 200, body: { plan: "PRO" } };
  installFetch();
  installIos();
  jest.clearAllMocks();
  // the phone sheet locks and restores page scroll; jsdom has no scrollTo
  window.scrollTo = jest.fn();
  window.open = jest.fn();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  delete (window as unknown as { __needtNative?: unknown }).__needtNative;
  delete (globalThis as { fetch?: unknown }).fetch;
});

async function render<P extends object>(
  node: ComponentType<P>,
  props?: NoInfer<P>
) {
  await act(async () => {
    root.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(node as ComponentType<object>, (props ?? {}) as object)
      )
    );
  });
  await settle();
}

/** Lets the account-token fetch, StoreKit and state updates finish. */
async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

const text = () => document.body.textContent ?? "";
const q = <T extends Element>(sel: string) =>
  document.body.querySelector<T>(sel);
async function click(el: Element | null) {
  expect(el).not.toBeNull();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

const props = { open: true, onClose: jest.fn(), feature: "Plan my day" };
const NEUTRAL = "This is part of Needt Pro.";

describe("neutral Pro sheet stays when the App Store cannot sell", () => {
  it("plugin missing (iOS shell without NeedtStore)", async () => {
    installIos(false);
    await render(Paywall, props);
    expect(text()).toContain(NEUTRAL);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(q("[data-pw-apple]")).toBeNull();
  });

  it("Mac App Store build (no StoreKit bridge)", async () => {
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    (window as unknown as { __needtNative?: unknown }).__needtNative = {
      platform: "mac-swift",
      distribution: "appstore",
    };
    await render(Paywall, props);
    expect(text()).toContain(NEUTRAL);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("server says enabled: false", async () => {
    tokenReply = {
      status: 200,
      body: { appAccountToken: TOKEN, enabled: false, products: [YEARLY] },
    };
    await render(Paywall, props);
    expect(text()).toContain(NEUTRAL);
    expect(q("[data-pw-apple]")).toBeNull();
    expect(store.products).not.toHaveBeenCalled();
  });

  it("server lists no products", async () => {
    tokenReply = {
      status: 200,
      body: { appAccountToken: TOKEN, enabled: true, products: [] },
    };
    await render(Paywall, props);
    expect(text()).toContain(NEUTRAL);
    expect(q("[data-pw-apple]")).toBeNull();
  });

  it("StoreKit knows none of the products", async () => {
    store.products.mockResolvedValue({ products: [] });
    await render(Paywall, props);
    expect(text()).toContain(NEUTRAL);
  });

  it("the account-token request fails", async () => {
    tokenReply = { status: 500, body: { error: "boom" } };
    await render(Paywall, props);
    expect(text()).toContain(NEUTRAL);
  });
});

describe("desktop purchase sheet", () => {
  it("shows StoreKit's own prices, terms, links and Restore Purchases", async () => {
    await render(Paywall, props);
    expect(text()).not.toContain(NEUTRAL);
    // products come back in order monthly, yearly, lifetime
    const ids = Array.from(
      document.body.querySelectorAll("[data-pw-apple-product]")
    ).map((e) => e.getAttribute("data-pw-apple-product"));
    expect(ids).toEqual([MONTHLY, YEARLY, LIFETIME]);
    for (const p of PRODUCTS) {
      expect(text()).toContain(p.displayPrice);
      expect(text()).toContain(p.displayName);
    }
    expect(text()).toContain("per month");
    expect(text()).toContain("per year");
    expect(text()).toContain("One-time purchase");
    expect(text()).toContain("AI included");
    expect(text()).toContain(
      "Subscriptions renew automatically until cancelled"
    );
    expect(text()).toContain("Settings → Apple ID → Subscriptions");
    expect(q("[data-pw-apple-terms]")?.textContent).toBe("Terms of Use");
    expect(q("[data-pw-apple-privacy]")?.textContent).toBe("Privacy Policy");
    expect(q("[data-pw-apple-restore]")?.textContent).toBe("Restore Purchases");
    // yearly is the default pick; no price text outside StoreKit's values
    expect(
      q("[data-pw-apple-product='" + YEARLY + "']")?.getAttribute(
        "aria-checked"
      )
    ).toBe("true");
    const stripped = PRODUCTS.reduce(
      (t, p) => t.split(p.displayPrice).join(""),
      text()
    );
    expect(stripped).not.toMatch(/[$€£]\s?\d|\bCHF\b|\bUSD\b|\bEUR\b/);
  });

  it("shows a loading state while prices load", async () => {
    let release: (v: unknown) => void = () => undefined;
    store.products.mockReturnValue(new Promise((r) => (release = r)));
    await act(async () => {
      root.render(h(QueryClientProvider, { client: qc }, h(Paywall, props)));
    });
    await settle();
    expect(q("[data-pw-apple-loading]")).not.toBeNull();
    expect(q("[data-pw-apple-buy]")).toBeNull();
    await act(async () => {
      release({ products: PRODUCTS });
    });
    await settle();
    expect(q("[data-pw-apple-loading]")).toBeNull();
    expect(q("[data-pw-apple-buy]")).not.toBeNull();
  });

  it("buys the picked product, refreshes billing and closes", async () => {
    const onClose = jest.fn();
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    await render(Paywall, { ...props, onClose });
    await click(q("[data-pw-apple-product='" + MONTHLY + "']"));
    await click(q("[data-pw-apple-buy]"));
    expect(store.purchase).toHaveBeenCalledWith({
      id: MONTHLY,
      appAccountToken: TOKEN,
    });
    const posted = fetchMock.mock.calls.find(
      ([u, i]) => String(u).includes("/transactions") && i?.method === "POST"
    );
    expect(JSON.parse(posted![1].body)).toEqual({
      signedTransaction: TX.signedTransaction,
    });
    expect(store.finish).toHaveBeenCalledWith({
      transactionId: TX.transactionId,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.plan() });
    expect(notify.success).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables the controls while a purchase runs", async () => {
    let release: (v: unknown) => void = () => undefined;
    store.purchase.mockReturnValue(new Promise((r) => (release = r)));
    await render(Paywall, props);
    await click(q("[data-pw-apple-buy]"));
    expect(q<HTMLButtonElement>("[data-pw-apple-buy]")?.disabled).toBe(true);
    expect(q("[data-pw-apple-buy]")?.textContent).toBe("Purchasing…");
    expect(q<HTMLButtonElement>("[data-pw-apple-restore]")?.disabled).toBe(
      true
    );
    await act(async () => {
      release({ status: "cancelled" });
    });
    await settle();
    expect(q<HTMLButtonElement>("[data-pw-apple-buy]")?.disabled).toBe(false);
  });

  it("a cancelled purchase is silent and the sheet stays", async () => {
    const onClose = jest.fn();
    store.purchase.mockResolvedValue({ status: "cancelled" });
    await render(Paywall, { ...props, onClose });
    await click(q("[data-pw-apple-buy]"));
    expect(notify.error).not.toHaveBeenCalled();
    expect(notify.success).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(q("[data-pw-apple]")).not.toBeNull();
  });

  it("Ask to Buy shows a waiting state", async () => {
    store.purchase.mockResolvedValue({ status: "pending" });
    await render(Paywall, props);
    await click(q("[data-pw-apple-buy]"));
    expect(q("[data-pw-apple-pending]")?.textContent).toContain(
      "Waiting for approval"
    );
    expect(notify.error).not.toHaveBeenCalled();
  });

  it("a Creem plan already active says so", async () => {
    postReply = {
      status: 409,
      body: { code: "CREEM_ACTIVE", error: "Active elsewhere" },
    };
    const onClose = jest.fn();
    await render(Paywall, { ...props, onClose });
    await click(q("[data-pw-apple-buy]"));
    expect(notify.error).toHaveBeenCalledWith(
      "Your Pro plan was already active. You can ask Apple for a refund at reportaproblem.apple.com."
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a purchase owned by another account says so", async () => {
    postReply = {
      status: 409,
      body: { code: "APPLE_TRANSACTION_IN_USE", error: "in use" },
    };
    await render(Paywall, props);
    await click(q("[data-pw-apple-buy]"));
    expect(notify.error).toHaveBeenCalledWith(
      "This App Store purchase belongs to another Needt account."
    );
  });

  it("a permanent refusal shows the server's message", async () => {
    postReply = {
      status: 400,
      body: { code: "APPLE_UNKNOWN_PRODUCT", error: "Unknown product." },
    };
    await render(Paywall, props);
    await click(q("[data-pw-apple-buy]"));
    expect(notify.error).toHaveBeenCalledWith("Unknown product.");
  });

  it("Apple charged but the server is busy: told it went through, not an error", async () => {
    postReply = { status: 503, body: { error: "Try again later." } };
    const onClose = jest.fn();
    await render(Paywall, { ...props, onClose });
    await click(q("[data-pw-apple-buy]"));
    expect(notify.info).toHaveBeenCalledWith(
      "Your purchase went through. Needt will apply it as soon as it can reach the server."
    );
    expect(notify.error).not.toHaveBeenCalled();
    // the transaction is left unfinished so StoreKit hands it back
    expect(store.finish).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Apple charged but the network is down: same notice", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/account-token")) return reply(tokenReply);
      throw new Error("offline");
    });
    await render(Paywall, props);
    await click(q("[data-pw-apple-buy]"));
    expect(notify.info).toHaveBeenCalledWith(
      expect.stringContaining("Your purchase went through")
    );
    expect(notify.error).not.toHaveBeenCalled();
  });

  it("a 2xx without an active plan is not a success", async () => {
    postReply = { status: 200, body: { plan: "FREE" } };
    const onClose = jest.fn();
    await render(Paywall, { ...props, onClose });
    await click(q("[data-pw-apple-buy]"));
    expect(notify.success).not.toHaveBeenCalled();
    expect(notify.info).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Lifetime counts as an active plan", async () => {
    postReply = { status: 200, body: { plan: "LIFETIME" } };
    const onClose = jest.fn();
    await render(Paywall, { ...props, onClose });
    await click(q("[data-pw-apple-product='" + LIFETIME + "']"));
    await click(q("[data-pw-apple-buy]"));
    expect(q("[data-pw-apple-buy]")?.textContent).toBe("Buy");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Restore with a 2xx but no active plan is not a success", async () => {
    postReply = { status: 200, body: { plan: "FREE" } };
    const onClose = jest.fn();
    await render(Paywall, { ...props, onClose });
    await click(q("[data-pw-apple-restore]"));
    expect(notify.success).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a failed StoreKit purchase shows its message", async () => {
    store.purchase.mockResolvedValue({
      status: "failed",
      message: "Card declined",
    });
    await render(Paywall, props);
    await click(q("[data-pw-apple-buy]"));
    expect(notify.error).toHaveBeenCalledWith("Card declined");
  });

  it("Restore Purchases restores, refreshes billing and closes", async () => {
    const onClose = jest.fn();
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    await render(Paywall, { ...props, onClose });
    await click(q("[data-pw-apple-restore]"));
    expect(store.restore).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.plan() });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Restore with nothing to restore says so and stays open", async () => {
    store.restore.mockResolvedValue({ transactions: [] });
    const onClose = jest.fn();
    await render(Paywall, { ...props, onClose });
    await click(q("[data-pw-apple-restore]"));
    expect(notify.info).toHaveBeenCalledWith("No purchases to restore.");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Close and Escape close it", async () => {
    const onClose = jest.fn();
    await render(Paywall, { ...props, onClose });
    await click(q("button[data-pw-close]"));
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("phone purchase sheet", () => {
  it("lists StoreKit's prices and buys", async () => {
    const onClose = jest.fn();
    await render(PkPaywall, { ...props, onClose });
    for (const p of PRODUCTS) expect(text()).toContain(p.displayPrice);
    expect(q("[data-pw-apple-terms]")).not.toBeNull();
    expect(q("[data-pw-apple-privacy]")).not.toBeNull();
    await click(q("[data-pw-apple-buy]"));
    expect(store.purchase).toHaveBeenCalledWith({
      id: YEARLY,
      appAccountToken: TOKEN,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("stays neutral when the plugin is missing", async () => {
    installIos(false);
    await render(PkPaywall, props);
    expect(text()).toContain(NEUTRAL);
    expect(q("[data-pw-apple]")).toBeNull();
  });

  it("stays neutral when the server has it off", async () => {
    tokenReply = {
      status: 200,
      body: { appAccountToken: TOKEN, enabled: false, products: [YEARLY] },
    };
    await render(PkPaywall, props);
    expect(text()).toContain(NEUTRAL);
  });
});

describe("Plan section and Plan page", () => {
  const apple = plan({
    plan: "PRO",
    kind: "monthly",
    status: "ACTIVE",
    interval: "month",
    currentPeriodEnd: "2099-09-01T00:00:00.000Z",
    source: "apple",
    manageUrl: "https://apps.apple.com/account/subscriptions",
  });

  it.each([
    ["PlanSection", PlanSection, "Manage in App Store"],
    ["PlanPage", PlanPage, "Manage in App Store"],
  ] as const)(
    "%s: Restore always, Manage only for an App Store plan",
    async (_n, C, manage) => {
      planData = apple;
      await render(C);
      expect(text()).toContain("Restore purchases");
      expect(text()).toContain(manage);

      // a Creem plan, a Free plan and a comp have no Manage in App Store
      for (const src of ["creem", null] as const) {
        planData = plan({ plan: "PRO", kind: "monthly", source: src });
        await render(C);
        expect(text()).toContain("Restore purchases");
        expect(text()).not.toContain(manage);
      }
      planData = plan({});
      await render(C);
      expect(text()).not.toContain(manage);
    }
  );

  it("Manage in App Store opens the subscription sheet", async () => {
    planData = apple;
    await render(PlanSection);
    const row = Array.from(
      document.body.querySelectorAll<HTMLElement>("[role=button]")
    ).find((e) => e.textContent?.includes("Manage in App Store"));
    const btn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent === "Manage"
    );
    await click(btn ?? row ?? null);
    expect(store.manageSubscriptions).toHaveBeenCalledTimes(1);
  });

  it("Restore purchases (phone) restores and refreshes billing", async () => {
    planData = apple;
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    await render(PlanPage);
    await click(q("[data-ps-restore]"));
    expect(store.restore).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.plan() });
  });

  it("no App Store rows without the plugin or with purchases off", async () => {
    planData = apple;
    installIos(false);
    await render(PlanSection);
    expect(text()).not.toContain("Restore purchases");
    expect(text()).not.toContain("Manage in App Store");

    installIos();
    tokenReply = {
      status: 200,
      body: { appAccountToken: TOKEN, enabled: false, products: [] },
    };
    await render(PlanPage);
    expect(text()).not.toContain("Restore purchases");
    // a subscriber can still manage after the server stops selling
    expect(text()).toContain("Manage in App Store");
  });
});

describe("intro offer", () => {
  const offer = (over: Record<string, unknown> = {}) => ({
    displayPrice: "KRW 1,000",
    price: "1000",
    period: { unit: "month", value: 1 },
    periodCount: 3,
    paymentMode: "payAsYouGo",
    ...over,
  });
  const sub = (over: Record<string, unknown>) =>
    ({ ...PRODUCTS[1], ...over }) as unknown as StoreProduct;

  it("is a line only when StoreKit says the account is eligible", () => {
    const free = offer({
      paymentMode: "freeTrial",
      period: { unit: "day", value: 7 },
      periodCount: 1,
    });
    expect(introLine(sub({ introOffer: free }))).toBeNull();
    expect(
      introLine(sub({ introOffer: free, isEligibleForIntroOffer: false }))
    ).toBeNull();
    expect(
      introLine(sub({ introOffer: free, isEligibleForIntroOffer: true }))
    ).toBe("7 days free, then KRW 9,876 per month");
    expect(introLine(sub({ isEligibleForIntroOffer: true }))).toBeNull();
  });

  it("pay as you go is a price per period for N periods", () => {
    expect(
      introLine(sub({ introOffer: offer(), isEligibleForIntroOffer: true }))
    ).toBe("KRW 1,000 per month for 3 months, then KRW 9,876 per month");
  });

  it("pay up front is one price for the whole span", () => {
    expect(
      introLine(
        sub({
          introOffer: offer({ paymentMode: "payUpFront" }),
          isEligibleForIntroOffer: true,
        })
      )
    ).toBe("KRW 1,000 for 3 months, then KRW 9,876 per month");
  });

  it("perPeriod words a multi-unit period", () => {
    expect(perPeriod(sub({ period: { unit: "month", value: 3 } }))).toBe(
      "every 3 months"
    );
    expect(perPeriod(PRODUCTS[2] as unknown as StoreProduct)).toBe("");
  });

  it("the sheet shows the line for an eligible account only", async () => {
    const withIntro = (eligible: boolean) =>
      PRODUCTS.map((p) =>
        p.id === YEARLY
          ? {
              ...p,
              introOffer: offer({
                paymentMode: "freeTrial",
                period: { unit: "day", value: 7 },
                periodCount: 1,
              }),
              isEligibleForIntroOffer: eligible,
            }
          : p
      );
    store.products.mockResolvedValue({ products: withIntro(true) });
    await render(Paywall, props);
    expect(q("[data-pw-apple-intro]")?.textContent).toBe(
      "7 days free, then KRW 91,234 per year"
    );
    store.products.mockResolvedValue({ products: withIntro(false) });
    await act(async () => root.unmount());
    root = createRoot(host);
    await render(Paywall, props);
    expect(q("[data-pw-apple-intro]")).toBeNull();
  });
});

describe("a purchase in flight", () => {
  const escape = () =>
    act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });

  it("Escape, scrim and X do nothing until it ends", async () => {
    let release: (v: unknown) => void = () => undefined;
    store.purchase.mockReturnValue(new Promise((r) => (release = r)));
    const onClose = jest.fn();
    await render(Paywall, { ...props, onClose });
    await click(q("[data-pw-apple-buy]"));
    await escape();
    await act(async () => {
      q(".pw-scrim")!.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true })
      );
    });
    expect(q<HTMLButtonElement>("button[data-pw-close]")?.disabled).toBe(true);
    await click(q("button[data-pw-close]"));
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      release({ status: "cancelled" });
    });
    await settle();
    expect(q<HTMLButtonElement>("button[data-pw-close]")?.disabled).toBe(false);
    await escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the phone sheet's Close is off too", async () => {
    let release: (v: unknown) => void = () => undefined;
    store.purchase.mockReturnValue(new Promise((r) => (release = r)));
    await render(PkPaywall, props);
    await click(q("[data-pw-apple-buy]"));
    expect(q<HTMLButtonElement>("button[data-pw-close]")?.disabled).toBe(true);
    await act(async () => {
      release({ status: "cancelled" });
    });
    await settle();
    expect(q<HTMLButtonElement>("button[data-pw-close]")?.disabled).toBe(false);
  });

  it("a second buy does not start while one runs (any screen)", async () => {
    let release: (v: unknown) => void = () => undefined;
    store.purchase.mockReturnValue(new Promise((r) => (release = r)));
    const first = buyWithApple(YEARLY);
    const second = await buyWithApple(MONTHLY);
    expect(second).toMatchObject({ ok: false, reason: "busy" });
    const restore = await restoreApplePurchases();
    expect(restore).toMatchObject({ ok: false, reason: "busy" });
    await settle();
    release({ status: "cancelled" });
    expect(await first).toMatchObject({ ok: false, reason: "cancelled" });
    expect(store.purchase).toHaveBeenCalledTimes(1);
    // free again afterwards
    store.purchase.mockResolvedValue({ status: "cancelled" });
    expect(await buyWithApple(YEARLY)).toMatchObject({ reason: "cancelled" });
  });

  it("a late answer after the sheet is gone does not close anything", async () => {
    let release: (v: unknown) => void = () => undefined;
    store.purchase.mockReturnValue(new Promise((r) => (release = r)));
    const onClose = jest.fn();
    await render(Paywall, { ...props, onClose });
    await click(q("[data-pw-apple-buy]"));
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => {
      release({ status: "success", ...TX });
    });
    await settle();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Ask to Buy", () => {
  it("disables Subscribe while waiting and closes once the plan is Pro", async () => {
    store.purchase.mockResolvedValue({ status: "pending" });
    const onClose = jest.fn();
    await render(Paywall, { ...props, onClose });
    await click(q("[data-pw-apple-buy]"));
    expect(q("[data-pw-apple-pending]")).not.toBeNull();
    expect(q<HTMLButtonElement>("[data-pw-apple-buy]")?.disabled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    // the approval arrives through the shell and turns the plan Pro
    planData = plan({ plan: "PRO", kind: "monthly", status: "ACTIVE" });
    await render(Paywall, { ...props, onClose });
    expect(notify.success).toHaveBeenCalledWith("Needt Pro is active.");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("loading takes too long", () => {
  it("falls back to the neutral sheet after 20 seconds", async () => {
    jest.useFakeTimers();
    try {
      store.products.mockReturnValue(new Promise(() => undefined));
      await act(async () => {
        root.render(h(QueryClientProvider, { client: qc }, h(Paywall, props)));
      });
      for (let i = 0; i < 5; i++) await act(async () => Promise.resolve());
      expect(q("[data-pw-apple-loading]")).not.toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(APPLE_OFFER_TIMEOUT_MS - 1);
      });
      expect(q("[data-pw-apple-loading]")).not.toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(q("[data-pw-apple-loading]")).toBeNull();
      expect(text()).toContain(NEUTRAL);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("plan options and links", () => {
  const arrow = (el: Element | null, key: string) =>
    act(async () => {
      el!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });
  const opt = (id: string) =>
    q<HTMLButtonElement>("[data-pw-apple-product='" + id + "']");

  it("roving tabindex: one tab stop, arrows move the pick and focus", async () => {
    await render(Paywall, props);
    expect(opt(YEARLY)?.tabIndex).toBe(0);
    expect(opt(MONTHLY)?.tabIndex).toBe(-1);
    expect(opt(LIFETIME)?.tabIndex).toBe(-1);
    opt(YEARLY)!.focus();
    await arrow(opt(YEARLY), "ArrowDown");
    expect(opt(LIFETIME)?.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(opt(LIFETIME));
    expect(opt(LIFETIME)?.tabIndex).toBe(0);
    await arrow(opt(LIFETIME), "ArrowDown");
    expect(document.activeElement).toBe(opt(MONTHLY));
    await arrow(opt(MONTHLY), "ArrowUp");
    expect(document.activeElement).toBe(opt(LIFETIME));
    await arrow(opt(LIFETIME), "ArrowLeft");
    expect(document.activeElement).toBe(opt(YEARLY));
  });

  it("Terms of Use is Apple's standard EULA, Privacy is /privacy, both in a new window", async () => {
    await render(Paywall, props);
    expect(document.body.querySelector("a[href]")).toBeNull();
    await click(q("[data-pw-apple-terms]"));
    expect(window.open).toHaveBeenLastCalledWith(
      "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/",
      "_blank"
    );
    await click(q("[data-pw-apple-privacy]"));
    expect(window.open).toHaveBeenLastCalledWith("/privacy", "_blank");
    // the sheet is still there
    expect(q("[data-pw-apple]")).not.toBeNull();
  });
});

describe("transaction updates in the shell", () => {
  function Probe() {
    useAppleTransactionUpdates();
    return null;
  }

  it("subscribes once in the iOS app and stops on unmount", async () => {
    await render(Probe);
    expect(store.addListener).toHaveBeenCalledWith(
      "transactionUpdated",
      expect.any(Function)
    );
    expect(store.pendingTransactions).toHaveBeenCalled();
    await act(async () => root.unmount());
    expect(removeListener).toHaveBeenCalled();
    root = createRoot(host);
  });

  it("does nothing without the plugin", async () => {
    installIos(false);
    await render(Probe);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
