import {
  purchasePlan,
  sendUmamiEvent,
  sendUmamiPurchase,
  sendUmamiSignupCompleted,
  sendUmamiTrialStarted,
} from "@/lib/umami-server";

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

describe("sendUmamiEvent", () => {
  it("posts the named event with exactly the data it is given", async () => {
    await sendUmamiEvent("hub_item_completed", {
      itemId: "i1",
      outcome: "done",
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body).payload).toMatchObject({
      name: "hub_item_completed",
      data: { itemId: "i1", outcome: "done" },
    });
  });
});

describe("funnel events", () => {
  const sent = () => JSON.parse(fetchMock.mock.calls[0][1].body).payload;

  it("names the sign-up method, never the person", async () => {
    await sendUmamiSignupCompleted("credentials");
    expect(sent()).toMatchObject({
      website: "site-id-1",
      name: "signup_completed",
      data: { method: "email" },
    });
  });

  it("folds unknown providers into other", async () => {
    await sendUmamiSignupCompleted("github");
    expect(sent().data).toEqual({ method: "other" });
  });

  it("sends trial_started with its source", async () => {
    await sendUmamiTrialStarted("oauth");
    expect(sent()).toMatchObject({
      name: "trial_started",
      data: { source: "oauth" },
    });
  });

  it("sends nothing when an explicit website is empty", async () => {
    await sendUmamiEvent(
      "agent_registered",
      { kind: "x" },
      { website: undefined }
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
