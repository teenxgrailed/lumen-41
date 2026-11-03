/** @jest-environment node */
import {
  APPLE_PRODUCT_IDS,
  DRAIN_MIN_INTERVAL_MS,
  buyWithApple,
  getStoreProducts,
  isAppleStoreAvailable,
  isPermanentAppleRefusal,
  manageAppleSubscriptions,
  purchaseStoreProduct,
  restoreApplePurchases,
  subscribeAppleTransactionUpdates,
} from "@/lib/native-store";

const g = globalThis as unknown as { window?: unknown; fetch?: unknown };

const TOKEN = "11111111-2222-3333-4444-555555555555";
const TX = {
  signedTransaction: "jws.one",
  productId: APPLE_PRODUCT_IDS.proMonthly,
  transactionId: "1000",
};

function shell(plugin: Record<string, unknown> | undefined) {
  g.window = {
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
      Plugins: plugin ? { NeedtStore: plugin } : {},
    },
  };
}

function json(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function refusal(status: number, code?: string, extra?: object) {
  return json({ error: `refused ${code ?? status}`, code, ...extra }, status);
}

/** Routes the two billing endpoints; `post` answers the transactions POST. */
function mockServer(opts: { token?: unknown; post?: () => unknown }) {
  const fetchMock = jest.fn(async (path: string) => {
    if (path.endsWith("/account-token")) {
      return json(
        opts.token ?? {
          appAccountToken: TOKEN,
          enabled: true,
          products: Object.values(APPLE_PRODUCT_IDS),
        }
      );
    }
    return (opts.post?.() ?? json({ kind: "pro" })) as ReturnType<typeof json>;
  });
  g.fetch = fetchMock;
  return fetchMock;
}

const posts = (m: jest.Mock) =>
  m.mock.calls.filter(([p]) => String(p).endsWith("/transactions"));

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  delete g.window;
  delete g.fetch;
  jest.restoreAllMocks();
});

describe("native store bridge outside the iOS app", () => {
  it("is a silent no-op in a browser", async () => {
    expect(isAppleStoreAvailable()).toBe(false);
    await expect(getStoreProducts(["x"])).resolves.toEqual([]);
    await expect(manageAppleSubscriptions()).resolves.toBe(false);
    await expect(
      buyWithApple(APPLE_PRODUCT_IDS.proMonthly)
    ).resolves.toMatchObject({ ok: false, reason: "unavailable" });
    await expect(restoreApplePurchases()).resolves.toMatchObject({
      ok: false,
      reason: "unavailable",
    });
    expect(subscribeAppleTransactionUpdates()).toBeInstanceOf(Function);
  });

  it("is unavailable in the shell when the plugin is not registered", async () => {
    shell(undefined);
    expect(isAppleStoreAvailable()).toBe(false);
    await expect(
      buyWithApple(APPLE_PRODUCT_IDS.proYearly)
    ).resolves.toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("does not run on non-iOS platforms", () => {
    g.window = {
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => "android",
        Plugins: { NeedtStore: {} },
      },
    };
    expect(isAppleStoreAvailable()).toBe(false);
  });
});

describe("products, manage and the account token", () => {
  it("returns the products and never throws", async () => {
    const product = { id: APPLE_PRODUCT_IDS.proMonthly, displayPrice: "$7" };
    shell({ products: jest.fn().mockResolvedValue({ products: [product] }) });
    await expect(getStoreProducts([product.id])).resolves.toEqual([product]);
    shell({ products: jest.fn().mockRejectedValue(new Error("boom")) });
    await expect(getStoreProducts(["x"])).resolves.toEqual([]);
  });

  it("opens the subscription sheet", async () => {
    const manage = jest.fn().mockResolvedValue(undefined);
    shell({ manageSubscriptions: manage });
    await expect(manageAppleSubscriptions()).resolves.toBe(true);
    expect(manage).toHaveBeenCalled();
  });

  it("refuses a purchase without a UUID account token before the sheet", async () => {
    const purchase = jest.fn();
    shell({ purchase });
    for (const bad of ["", "not-a-uuid", undefined as unknown as string]) {
      await expect(
        purchaseStoreProduct(APPLE_PRODUCT_IDS.proMonthly, bad)
      ).resolves.toMatchObject({ status: "failed" });
    }
    expect(purchase).not.toHaveBeenCalled();
  });
});

describe("buyWithApple", () => {
  it("token -> purchase -> post -> finish, in that order", async () => {
    const order: string[] = [];
    const purchase = jest.fn(async () => {
      order.push("purchase");
      return { status: "success", ...TX };
    });
    const finish = jest.fn(async () => {
      order.push("finish");
      return { finished: true };
    });
    shell({ purchase, finish });
    const fetchMock = mockServer({
      post: () => {
        order.push("post");
        return json({ kind: "pro", plan: "monthly" });
      },
    });

    const result = await buyWithApple(APPLE_PRODUCT_IDS.proMonthly);

    expect(result).toEqual({
      ok: true,
      billing: { kind: "pro", plan: "monthly" },
    });
    expect(order).toEqual(["purchase", "post", "finish"]);
    expect(purchase).toHaveBeenCalledWith({
      id: APPLE_PRODUCT_IDS.proMonthly,
      appAccountToken: TOKEN,
    });
    expect(finish).toHaveBeenCalledWith({ transactionId: "1000" });
    const post = posts(fetchMock)[0];
    expect(post?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(post?.[1]?.body ?? "{}")).toEqual({
      signedTransaction: "jws.one",
    });
  });

  it("stops before the sheet when Apple purchases are disabled", async () => {
    const purchase = jest.fn();
    shell({ purchase });
    mockServer({
      token: { appAccountToken: TOKEN, enabled: false, products: [] },
    });
    const res = await buyWithApple(APPLE_PRODUCT_IDS.lifetime);
    expect(res).toMatchObject({ ok: false, reason: "failed" });
    expect(purchase).not.toHaveBeenCalled();
  });

  it("refuses a product the server does not list", async () => {
    const purchase = jest.fn();
    shell({ purchase });
    mockServer({
      token: {
        appAccountToken: TOKEN,
        enabled: true,
        products: [APPLE_PRODUCT_IDS.proYearly],
      },
    });
    const res = await buyWithApple(APPLE_PRODUCT_IDS.proMonthly);
    expect(res).toMatchObject({ ok: false, reason: "failed" });
    expect(purchase).not.toHaveBeenCalled();
  });

  it("passes pending and cancelled through without posting", async () => {
    const fetchMock = mockServer({});
    shell({ purchase: jest.fn().mockResolvedValue({ status: "pending" }) });
    await expect(
      buyWithApple(APPLE_PRODUCT_IDS.proMonthly)
    ).resolves.toMatchObject({ ok: false, reason: "pending" });
    shell({ purchase: jest.fn().mockResolvedValue({ status: "cancelled" }) });
    await expect(
      buyWithApple(APPLE_PRODUCT_IDS.proMonthly)
    ).resolves.toMatchObject({ ok: false, reason: "cancelled" });
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it("turns a native rejection or a network error into failed", async () => {
    mockServer({});
    shell({
      purchase: jest.fn().mockRejectedValue(new Error("StoreKit down")),
    });
    await expect(
      buyWithApple(APPLE_PRODUCT_IDS.proMonthly)
    ).resolves.toMatchObject({
      ok: false,
      reason: "failed",
      message: "StoreKit down",
    });
    shell({
      purchase: jest.fn().mockResolvedValue({ status: "success", ...TX }),
      finish: jest.fn(),
    });
    g.fetch = jest.fn(async (path: string) => {
      if (path.endsWith("/account-token")) {
        return json({
          appAccountToken: TOKEN,
          enabled: true,
          products: Object.values(APPLE_PRODUCT_IDS),
        });
      }
      throw new Error("offline");
    });
    await expect(buyWithApple(APPLE_PRODUCT_IDS.proMonthly)).resolves.toEqual({
      ok: false,
      reason: "failed",
      message: "offline",
      // StoreKit charged: the transaction is held for a retry
      purchased: true,
    });
  });
});

describe("finish / no-finish matrix", () => {
  const FINISH: Array<[number, string]> = [
    [403, "APPLE_ACCOUNT_MISMATCH"],
    [409, "CREEM_ACTIVE"],
    [409, "APPLE_TRANSACTION_IN_USE"],
    [400, "APPLE_UNKNOWN_PRODUCT"],
    [400, "APPLE_MALFORMED"],
    [400, "APPLE_INVALID_SIGNATURE"],
  ];
  const KEEP: Array<[number, string | undefined]> = [
    [401, undefined],
    [429, undefined],
    [500, undefined],
    [502, undefined],
    [503, "APPLE_RETRYABLE"],
    [403, "INVALID_ORIGIN"],
    [403, "SANDBOX_LOCKED"],
    [400, "APPLE_WRONG_ENVIRONMENT"],
    [400, "APPLE_WRONG_BUNDLE"],
    [503, "APPLE_IAP_OFF"],
  ];

  it.each(FINISH)("finishes after %i %s", async (status, code) => {
    const finish = jest.fn().mockResolvedValue({ finished: true });
    shell({
      purchase: jest.fn().mockResolvedValue({ status: "success", ...TX }),
      finish,
    });
    mockServer({ post: () => refusal(status, code) });
    const res = await buyWithApple(APPLE_PRODUCT_IDS.proMonthly);
    expect(res).toMatchObject({ ok: false, reason: "failed", status, code });
    expect(finish).toHaveBeenCalledWith({ transactionId: "1000" });
    expect(isPermanentAppleRefusal(status, code)).toBe(true);
  });

  it.each(KEEP)("keeps %i %s unfinished", async (status, code) => {
    const finish = jest.fn().mockResolvedValue({ finished: true });
    shell({
      purchase: jest.fn().mockResolvedValue({ status: "success", ...TX }),
      finish,
      pendingTransactions: jest.fn().mockResolvedValue({ transactions: [] }),
    });
    mockServer({ post: () => refusal(status, code) });
    const res = await buyWithApple(APPLE_PRODUCT_IDS.proMonthly);
    expect(res).toMatchObject({ ok: false, reason: "failed", status, code });
    expect(finish).not.toHaveBeenCalled();
    expect(isPermanentAppleRefusal(status, code)).toBe(false);
  });

  it("keeps a transaction unfinished on a network error", async () => {
    const finish = jest.fn();
    shell({
      purchase: jest.fn().mockResolvedValue({ status: "success", ...TX }),
      finish,
    });
    g.fetch = jest.fn(async (path: string) => {
      if (path.endsWith("/account-token")) {
        return json({
          appAccountToken: TOKEN,
          enabled: true,
          products: Object.values(APPLE_PRODUCT_IDS),
        });
      }
      throw new Error("offline");
    });
    await buyWithApple(APPLE_PRODUCT_IDS.proMonthly);
    expect(finish).not.toHaveBeenCalled();
  });

  it("hands the server's status, code and manageUrl to the caller", async () => {
    shell({
      purchase: jest.fn().mockResolvedValue({ status: "success", ...TX }),
      finish: jest.fn().mockResolvedValue({ finished: true }),
    });
    mockServer({
      post: () =>
        refusal(409, "CREEM_ACTIVE", {
          manageUrl: "https://apps.apple.com/account/subscriptions",
        }),
    });
    await expect(buyWithApple(APPLE_PRODUCT_IDS.proMonthly)).resolves.toEqual({
      ok: false,
      reason: "failed",
      status: 409,
      code: "CREEM_ACTIVE",
      message: "refused CREEM_ACTIVE",
      manageUrl: "https://apps.apple.com/account/subscriptions",
    });
  });
});

describe("restoreApplePurchases", () => {
  it("posts and finishes every restored transaction", async () => {
    const second = {
      ...TX,
      transactionId: "1001",
      signedTransaction: "jws.two",
    };
    const finish = jest.fn().mockResolvedValue({ finished: true });
    shell({
      restore: jest.fn().mockResolvedValue({ transactions: [TX, second] }),
      finish,
    });
    const fetchMock = mockServer({});
    const res = await restoreApplePurchases();
    expect(res).toEqual({ ok: true, count: 2, billing: { kind: "pro" } });
    expect(finish).toHaveBeenCalledTimes(2);
    expect(posts(fetchMock)).toHaveLength(2);
  });

  it("reports empty, cancelled and failed", async () => {
    shell({ restore: jest.fn().mockResolvedValue({ transactions: [] }) });
    await expect(restoreApplePurchases()).resolves.toMatchObject({
      ok: false,
      reason: "empty",
    });
    shell({
      restore: jest
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("x"), { code: "cancelled" })
        ),
    });
    await expect(restoreApplePurchases()).resolves.toMatchObject({
      ok: false,
      reason: "cancelled",
    });
    const finish = jest.fn();
    shell({
      restore: jest.fn().mockResolvedValue({ transactions: [TX] }),
      finish,
    });
    mockServer({ post: () => refusal(500) });
    await expect(restoreApplePurchases()).resolves.toMatchObject({
      ok: false,
      reason: "failed",
      status: 500,
    });
    expect(finish).not.toHaveBeenCalled();
  });
});

describe("subscribeAppleTransactionUpdates", () => {
  it("replays pending updates and handles live events once", async () => {
    let emit: (t: unknown) => void = () => {};
    const remove = jest.fn();
    const finish = jest.fn().mockResolvedValue({ finished: true });
    const live = {
      ...TX,
      transactionId: "2000",
      signedTransaction: "jws.live",
    };
    shell({
      pendingTransactions: jest.fn().mockResolvedValue({ transactions: [TX] }),
      finish,
      addListener: jest.fn(async (_event: string, cb: (t: unknown) => void) => {
        emit = cb;
        return { remove };
      }),
    });
    const fetchMock = mockServer({});
    const seen: unknown[] = [];

    const stop = subscribeAppleTransactionUpdates((b) => seen.push(b));
    await flush();
    emit(live);
    await flush();

    const sent = posts(fetchMock).map(
      ([, init]) => JSON.parse(init?.body ?? "{}").signedTransaction
    );
    expect(sent).toEqual(["jws.one", "jws.live"]);
    expect(finish).toHaveBeenCalledWith({ transactionId: "1000" });
    expect(finish).toHaveBeenCalledWith({ transactionId: "2000" });
    expect(seen).toHaveLength(2);

    stop();
    expect(remove).toHaveBeenCalled();
    emit({ ...TX, transactionId: "3000" });
    await flush();
    expect(posts(fetchMock)).toHaveLength(2);
  });

  it("keeps an update unfinished when the server refuses it for now", async () => {
    const finish = jest.fn();
    shell({
      pendingTransactions: jest.fn().mockResolvedValue({ transactions: [TX] }),
      finish,
    });
    mockServer({ post: () => refusal(503, "APPLE_IAP_OFF") });
    const stop = subscribeAppleTransactionUpdates();
    await flush();
    expect(finish).not.toHaveBeenCalled();
    stop();
  });

  it("finishes an update the server refuses for good", async () => {
    const finish = jest.fn().mockResolvedValue({ finished: true });
    shell({
      pendingTransactions: jest.fn().mockResolvedValue({ transactions: [TX] }),
      finish,
    });
    mockServer({ post: () => refusal(403, "APPLE_ACCOUNT_MISMATCH") });
    const stop = subscribeAppleTransactionUpdates();
    await flush();
    expect(finish).toHaveBeenCalledWith({ transactionId: "1000" });
    stop();
  });

  it("drains at most once per minute, but at once after a purchase", async () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    const visibility = { visibilityState: "visible" as string };
    const listeners = new Set<() => void>();
    (globalThis as unknown as { document?: unknown }).document = {
      get visibilityState() {
        return visibility.visibilityState;
      },
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    };
    try {
      const pending = jest.fn().mockResolvedValue({ transactions: [] });
      shell({
        pendingTransactions: pending,
        purchase: jest.fn().mockResolvedValue({ status: "success", ...TX }),
        finish: jest.fn().mockResolvedValue({ finished: true }),
      });
      mockServer({});

      const stop = subscribeAppleTransactionUpdates();
      await flush();
      expect(pending).toHaveBeenCalledTimes(1);

      // app comes back to the front within a minute: no second drain
      now += DRAIN_MIN_INTERVAL_MS - 1;
      listeners.forEach((cb) => cb());
      await flush();
      expect(pending).toHaveBeenCalledTimes(1);

      // after the gap it drains again
      now += 2;
      listeners.forEach((cb) => cb());
      await flush();
      expect(pending).toHaveBeenCalledTimes(2);

      // a purchase ignores the gap
      await buyWithApple(APPLE_PRODUCT_IDS.proMonthly);
      await flush();
      expect(pending).toHaveBeenCalledTimes(3);

      stop();
      expect(listeners.size).toBe(0);
    } finally {
      delete (globalThis as unknown as { document?: unknown }).document;
    }
  });
});
