import { purchasePlan, sendUmamiPurchase } from "@/lib/umami-server";

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.UMAMI_HOST = "https://stats.needt.app/";
  process.env.UMAMI_LANDING_WEBSITE_ID = "site-id-1";
});

afterEach(() => {
  delete process.env.UMAMI_HOST;
  delete process.env.UMAMI_LANDING_WEBSITE_ID;
});

describe("purchasePlan", () => {
  it("names the three paid plans", () => {
    expect(purchasePlan("PRO", "year")).toBe("pro_year");
    expect(purchasePlan("PRO", "month")).toBe("pro_month");
    expect(purchasePlan("LIFETIME", null)).toBe("lifetime");
  });

  it("names nothing it cannot tell", () => {
    expect(purchasePlan("PRO", null)).toBeNull();
    expect(purchasePlan("FREE", "year")).toBeNull();
  });
});

describe("sendUmamiPurchase", () => {
  it("posts a purchase event with only the plan to /api/send", async () => {
    await sendUmamiPurchase("pro_year");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://stats.needt.app/api/send");
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual({
      type: "event",
      payload: {
        website: "site-id-1",
        hostname: "needt.app",
        url: "/",
        name: "purchase",
        data: { plan: "pro_year" },
      },
    });
  });

  it("is skipped when the environment is missing", async () => {
    delete process.env.UMAMI_HOST;
    await sendUmamiPurchase("lifetime");
    process.env.UMAMI_HOST = "https://stats.needt.app";
    delete process.env.UMAMI_LANDING_WEBSITE_ID;
    await sendUmamiPurchase("lifetime");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("only logs when the call fails or is refused", async () => {
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    await expect(sendUmamiPurchase("lifetime")).resolves.toBeUndefined();

    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(sendUmamiPurchase("lifetime")).resolves.toBeUndefined();
  });
});
