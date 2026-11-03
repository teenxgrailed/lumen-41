/** @jest-environment node */
import {
  APPLE_PRODUCT_IDS,
  buyWithApple,
  getStoreProducts,
  isAppleStoreAvailable,
  manageAppleSubscriptions,
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

/** Routes the two billing endpoints; `post` answers the transactions POST. */
function mockServer(opts: {
  token?: unknown;
  tokenStatus?: number;
  post?: () => unknown;
}) {
  const fetchMock = jest.fn(async (path: string, init?: { body?: string }) => {
    if (path.endsWith("/account-token")) {
      return json(
        opts.token ?? {
          appAccountToken: TOKEN,
          enabled: true,
          products: Object.values(APPLE_PRODUCT_IDS),
        },
        opts.tokenStatus ?? 200
      );
    }
    void init;
    return (opts.post?.() ?? json({ kind: "pro" })) as ReturnType<typeof json>;
  });
  g.fetch = fetchMock;
  return fetchMock;
}

afterEach(() => {
  delete g.window;
  delete g.fetch;
});

describe("native store bridge outside the iOS app", () => {
  it("is a silent no-op in a browser", async () => {
    expect(isAppleStoreAvailable()).toBe(false);
    await expect(getStoreProducts(["x"])).resolves.toEqual([]);
    await expect(manageAppleSubscriptions()).resolves.toBe(false);
    await expect(buyWithApple(APPLE_PRODUCT_IDS.proMonthly)).resolves.toEqual({
      status: "unavailable",
    });
    await expect(restoreApplePurchases()).resolves.toEqual({
      status: "unavailable",
    });
    expect(subscribeAppleTransactionUpdates()).toBeInstanceOf(Function);
  });

  it("is unavailable in the shell when the plugin is not registered", async () => {
    shell(undefined);
    expect(isAppleStoreAvailable()).toBe(false);
    await expect(buyWithApple(APPLE_PRODUCT_IDS.proYearly)).resolves.toEqual({
      status: "unavailable",
    });
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

describe("products and manage", () => {
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
      status: "success",
      billing: { kind: "pro", plan: "monthly" },
    });
    expect(order).toEqual(["purchase", "post", "finish"]);
    expect(purchase).toHaveBeenCalledWith({
      id: APPLE_PRODUCT_IDS.proMonthly,
      appAccountToken: TOKEN,
    });
    expect(finish).toHaveBeenCalledWith({ transactionId: "1000" });
    const post = fetchMock.mock.calls.find(([p]) =>
      p.endsWith("/transactions")
    );
    expect(post?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(post?.[1]?.body ?? "{}")).toEqual({
      signedTransaction: "jws.one",
    });
  });

  it("does not finish when the server refuses the transaction", async () => {
    const finish = jest.fn();
    shell({
      purchase: jest.fn().mockResolvedValue({ status: "success", ...TX }),
      finish,
    });
    mockServer({ post: () => json({ error: "Not verified" }, 400) });
    await expect(buyWithApple(APPLE_PRODUCT_IDS.proMonthly)).resolves.toEqual({
      status: "failed",
      message: "Not verified",
    });
    expect(finish).not.toHaveBeenCalled();
  });

  it("stops before the sheet when Apple purchases are disabled", async () => {
    const purchase = jest.fn();
    shell({ purchase });
    mockServer({
      token: { appAccountToken: TOKEN, enabled: false, products: [] },
    });
    const res = await buyWithApple(APPLE_PRODUCT_IDS.lifetime);
    expect(res.status).toBe("failed");
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
    expect(res.status).toBe("failed");
    expect(purchase).not.toHaveBeenCalled();
  });

  it("passes pending and cancelled through without posting", async () => {
    const fetchMock = mockServer({});
    shell({ purchase: jest.fn().mockResolvedValue({ status: "pending" }) });
    await expect(buyWithApple(APPLE_PRODUCT_IDS.proMonthly)).resolves.toEqual({
      status: "pending",
    });
    shell({ purchase: jest.fn().mockResolvedValue({ status: "cancelled" }) });
    await expect(buyWithApple(APPLE_PRODUCT_IDS.proMonthly)).resolves.toEqual({
      status: "cancelled",
    });
    expect(
      fetchMock.mock.calls.some(([p]) => p.endsWith("/transactions"))
    ).toBe(false);
  });

  it("turns a native rejection or a network error into failed", async () => {
    mockServer({});
    shell({
      purchase: jest.fn().mockRejectedValue(new Error("StoreKit down")),
    });
    await expect(buyWithApple(APPLE_PRODUCT_IDS.proMonthly)).resolves.toEqual({
      status: "failed",
      message: "StoreKit down",
    });
    g.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    await expect(buyWithApple(APPLE_PRODUCT_IDS.proMonthly)).resolves.toEqual({
      status: "failed",
      message: "offline",
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
    expect(res).toEqual({
      status: "restored",
      count: 2,
      billing: { kind: "pro" },
    });
    expect(finish).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.filter(([p]) => p.endsWith("/transactions"))
    ).toHaveLength(2);
  });

  it("reports empty, cancelled and failed", async () => {
    shell({ restore: jest.fn().mockResolvedValue({ transactions: [] }) });
    await expect(restoreApplePurchases()).resolves.toEqual({ status: "empty" });
    shell({
      restore: jest
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("x"), { code: "cancelled" })
        ),
    });
    await expect(restoreApplePurchases()).resolves.toEqual({
      status: "cancelled",
    });
    shell({
      restore: jest.fn().mockResolvedValue({ transactions: [TX] }),
      finish: jest.fn(),
    });
    mockServer({ post: () => json({ error: "nope" }, 500) });
    await expect(restoreApplePurchases()).resolves.toEqual({
      status: "failed",
      message: "nope",
    });
  });
});

describe("subscribeAppleTransactionUpdates", () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

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

    const posts = fetchMock.mock.calls
      .filter(([p]) => p.endsWith("/transactions"))
      .map(([, init]) => JSON.parse(init?.body ?? "{}").signedTransaction);
    expect(posts).toEqual(["jws.one", "jws.live"]);
    expect(finish).toHaveBeenCalledWith({ transactionId: "1000" });
    expect(finish).toHaveBeenCalledWith({ transactionId: "2000" });
    expect(seen).toHaveLength(2);

    stop();
    expect(remove).toHaveBeenCalled();
    emit({ ...TX, transactionId: "3000" });
    await flush();
    expect(
      fetchMock.mock.calls.filter(([p]) => p.endsWith("/transactions"))
    ).toHaveLength(2);
  });

  it("keeps an update unfinished when the server refuses it", async () => {
    const finish = jest.fn();
    shell({
      pendingTransactions: jest.fn().mockResolvedValue({ transactions: [TX] }),
      finish,
    });
    mockServer({ post: () => json({ error: "later" }, 503) });
    const stop = subscribeAppleTransactionUpdates();
    await flush();
    expect(finish).not.toHaveBeenCalled();
    stop();
  });
});
