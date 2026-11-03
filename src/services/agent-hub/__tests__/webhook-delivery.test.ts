/**
 * Webhook delivery: the signature receivers verify, the SSRF guard, the retry
 * schedule (1m, 5m, 30m, 2h, 12h) and the auto-disable after 20 failed
 * deliveries in a row. No database and no network: prisma and the transport
 * are stubbed.
 */
import { createHmac, randomBytes } from "node:crypto";

import { canUseHubWebhooks } from "@/lib/entitlements";
import { encryptSecret } from "@/lib/security/secret-encryption";

import {
  HUB_WEBHOOK_TEST_EVENT,
  WEBHOOK_AUTO_DISABLE_AFTER,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_RETRY_DELAYS_MS,
  assertWebhookUrl,
  attemptDelivery,
  httpsWebhookTransport,
  nextRetryDelayMs,
  signWebhookBody,
} from "../webhook-delivery";

const db = {
  hubWebhookDelivery: { findUnique: jest.fn(), update: jest.fn() },
  hubWebhook: { update: jest.fn() },
};
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return db;
  },
}));
jest.mock("@/lib/entitlements", () => ({ canUseHubWebhooks: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Generated per run: a test fixture, not a credential.
const SECRET = `whsec_${randomBytes(16).toString("hex")}`;
const NOW = new Date("2026-11-03T12:00:00.000Z");
const publicHost = async () => ["93.184.216.34"];

function delivery(over: Record<string, unknown> = {}, hook: object = {}) {
  return {
    id: "d1",
    event: "item.created",
    payload: { event: "item.created", data: { item: { id: "i1" } } },
    status: "pending",
    attempts: 0,
    webhook: {
      id: "w1",
      userId: "u1",
      url: "https://hooks.example.com/needt",
      secret: encryptSecret(SECRET),
      active: true,
      consecutiveFailures: 0,
      ...hook,
    },
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (canUseHubWebhooks as jest.Mock).mockResolvedValue({ allowed: true });
  db.hubWebhookDelivery.update.mockResolvedValue({});
  db.hubWebhook.update.mockResolvedValue({
    consecutiveFailures: 1,
    active: true,
  });
});

describe("signature", () => {
  it("is sha256= and the hex HMAC of the raw body with the secret", () => {
    const body = '{"event":"item.created","data":{"n":1}}';
    const expected = createHmac("sha256", SECRET).update(body).digest("hex");
    expect(signWebhookBody(SECRET, body)).toBe(`sha256=${expected}`);
  });

  it("changes with the body and with the secret", () => {
    const a = signWebhookBody(SECRET, "{}");
    expect(signWebhookBody(SECRET, '{"a":1}')).not.toBe(a);
    expect(signWebhookBody("other", "{}")).not.toBe(a);
  });

  it("is sent on the request with the event name, over the exact body", async () => {
    db.hubWebhookDelivery.findUnique.mockResolvedValue(delivery());
    const transport = jest.fn().mockResolvedValue({ status: 200 });
    await attemptDelivery("d1", {
      transport,
      resolve: publicHost,
      now: () => NOW,
    });
    const [, { body, headers }] = transport.mock.calls[0];
    expect(headers["x-needt-signature"]).toBe(signWebhookBody(SECRET, body));
    expect(headers["x-needt-event"]).toBe("item.created");
    expect(JSON.parse(body).event).toBe("item.created");
  });
});

describe("SSRF guard", () => {
  it.each([
    ["http://hooks.example.com/x", "non-https"],
    ["https://user:pw@hooks.example.com/x", "credentials"],
    ["https://hooks.example.com:8443/x", "odd port"],
    ["https://127.0.0.1/x", "loopback"],
    ["https://10.0.0.5/x", "private ipv4"],
    ["https://169.254.169.254/latest/meta-data", "cloud metadata"],
    ["https://[::1]/x", "ipv6 loopback"],
    ["https://[::ffff:192.168.1.1]/x", "mapped private"],
    ["not a url", "garbage"],
  ])("refuses %s (%s)", async (url) => {
    await expect(assertWebhookUrl(url, publicHost)).rejects.toMatchObject({
      code: "INVALID",
    });
  });

  it("refuses a name that resolves to a private address", async () => {
    await expect(
      assertWebhookUrl("https://sneaky.example.com/x", async () => [
        "93.184.216.34",
        "10.1.2.3",
      ])
    ).rejects.toMatchObject({ code: "INVALID" });
  });

  it("accepts a public https address", async () => {
    await expect(
      assertWebhookUrl("https://hooks.example.com/x", publicHost)
    ).resolves.toBeInstanceOf(URL);
  });

  it("checks again at delivery: a saved URL that now resolves privately is not called", async () => {
    db.hubWebhookDelivery.findUnique.mockResolvedValue(delivery());
    const transport = jest.fn();
    const outcome = await attemptDelivery("d1", {
      transport,
      resolve: async () => ["127.0.0.1"],
      now: () => NOW,
    });
    expect(transport).not.toHaveBeenCalled();
    expect(outcome.state).toBe("retry");
    expect(
      db.hubWebhookDelivery.update.mock.calls[0][0].data.lastError
    ).toMatch(/not public|refused/i);
  });
});

describe("retry schedule", () => {
  it("is 1m, 5m, 30m, 2h, 12h and then nothing", () => {
    expect(WEBHOOK_RETRY_DELAYS_MS).toEqual([
      60_000, 300_000, 1_800_000, 7_200_000, 43_200_000,
    ]);
    expect([1, 2, 3, 4, 5, 6].map(nextRetryDelayMs)).toEqual([
      60_000,
      300_000,
      1_800_000,
      7_200_000,
      43_200_000,
      null,
    ]);
    expect(WEBHOOK_MAX_ATTEMPTS).toBe(6);
  });

  it.each([0, 1, 2, 3, 4])(
    "after failed try %i the next one is scheduled at the next delay",
    async (before) => {
      db.hubWebhookDelivery.findUnique.mockResolvedValue(
        delivery({ attempts: before })
      );
      const transport = jest.fn().mockResolvedValue({ status: 500 });
      const outcome = await attemptDelivery("d1", {
        transport,
        resolve: publicHost,
        now: () => NOW,
      });
      expect(outcome).toMatchObject({
        state: "retry",
        delayMs: WEBHOOK_RETRY_DELAYS_MS[before],
      });
      const data = db.hubWebhookDelivery.update.mock.calls[0][0].data;
      expect(data.attempts).toBe(before + 1);
      expect(data.nextAttemptAt).toEqual(
        new Date(NOW.getTime() + WEBHOOK_RETRY_DELAYS_MS[before])
      );
      expect(data.status).toBeUndefined();
      expect(db.hubWebhook.update).not.toHaveBeenCalled();
    }
  );

  it("marks the delivery failed after the last retry", async () => {
    db.hubWebhookDelivery.findUnique.mockResolvedValue(
      delivery({ attempts: 5 })
    );
    const outcome = await attemptDelivery("d1", {
      transport: jest.fn().mockResolvedValue({ status: 502 }),
      resolve: publicHost,
      now: () => NOW,
    });
    expect(outcome).toEqual({ state: "failed", disabled: false });
    expect(db.hubWebhookDelivery.update.mock.calls[0][0].data).toMatchObject({
      status: "failed",
      attempts: 6,
      lastStatus: 502,
      nextAttemptAt: null,
    });
  });

  it("a timeout or network error counts as a failed try", async () => {
    db.hubWebhookDelivery.findUnique.mockResolvedValue(delivery());
    const outcome = await attemptDelivery("d1", {
      transport: jest.fn().mockRejectedValue(new Error("timeout")),
      resolve: publicHost,
      now: () => NOW,
    });
    expect(outcome.state).toBe("retry");
    expect(db.hubWebhookDelivery.update.mock.calls[0][0].data.lastError).toBe(
      "timeout"
    );
  });
});

describe("success and auto-disable", () => {
  it("a 2xx finishes the delivery and resets the failure count", async () => {
    db.hubWebhookDelivery.findUnique.mockResolvedValue(
      delivery({}, { consecutiveFailures: 7 })
    );
    const outcome = await attemptDelivery("d1", {
      transport: jest.fn().mockResolvedValue({ status: 204 }),
      resolve: publicHost,
      now: () => NOW,
    });
    expect(outcome).toEqual({ state: "success" });
    expect(db.hubWebhookDelivery.update.mock.calls[0][0].data).toMatchObject({
      status: "success",
      lastStatus: 204,
    });
    expect(db.hubWebhook.update.mock.calls[0][0].data).toMatchObject({
      consecutiveFailures: 0,
    });
  });

  it("a redirect is a failure, not followed", async () => {
    db.hubWebhookDelivery.findUnique.mockResolvedValue(delivery());
    const outcome = await attemptDelivery("d1", {
      transport: jest.fn().mockResolvedValue({ status: 302 }),
      resolve: publicHost,
      now: () => NOW,
    });
    expect(outcome.state).toBe("retry");
  });

  it(`switches the webhook off at the ${WEBHOOK_AUTO_DISABLE_AFTER}th failed delivery in a row`, async () => {
    db.hubWebhookDelivery.findUnique.mockResolvedValue(
      delivery({ attempts: 5 })
    );
    db.hubWebhook.update
      .mockResolvedValueOnce({
        consecutiveFailures: WEBHOOK_AUTO_DISABLE_AFTER,
        active: true,
      })
      .mockResolvedValue({});
    const outcome = await attemptDelivery("d1", {
      transport: jest.fn().mockResolvedValue({ status: 500 }),
      resolve: publicHost,
      now: () => NOW,
    });
    expect(outcome).toEqual({ state: "failed", disabled: true });
    const off = db.hubWebhook.update.mock.calls[1][0].data;
    expect(off.active).toBe(false);
    expect(off.disabledReason).toMatch(/20 failed deliveries/);
  });

  it("stays on at the 19th", async () => {
    db.hubWebhookDelivery.findUnique.mockResolvedValue(
      delivery({ attempts: 5 })
    );
    db.hubWebhook.update.mockResolvedValueOnce({
      consecutiveFailures: WEBHOOK_AUTO_DISABLE_AFTER - 1,
      active: true,
    });
    const outcome = await attemptDelivery("d1", {
      transport: jest.fn().mockResolvedValue({ status: 500 }),
      resolve: publicHost,
      now: () => NOW,
    });
    expect(outcome).toEqual({ state: "failed", disabled: false });
    expect(db.hubWebhook.update).toHaveBeenCalledTimes(1);
  });

  it("an event queued before the webhook was switched off is dropped, a test is not", async () => {
    db.hubWebhookDelivery.findUnique.mockResolvedValue(
      delivery({}, { active: false })
    );
    const transport = jest.fn();
    expect(
      (await attemptDelivery("d1", { transport, resolve: publicHost })).state
    ).toBe("skipped");
    expect(transport).not.toHaveBeenCalled();

    db.hubWebhookDelivery.findUnique.mockResolvedValue(
      delivery({ event: HUB_WEBHOOK_TEST_EVENT }, { active: false })
    );
    transport.mockResolvedValue({ status: 200 });
    expect(
      (await attemptDelivery("d1", { transport, resolve: publicHost })).state
    ).toBe("success");
  });

  it("does nothing for a delivery that is not pending", async () => {
    db.hubWebhookDelivery.findUnique.mockResolvedValue(
      delivery({ status: "success" })
    );
    const transport = jest.fn();
    expect((await attemptDelivery("d1", { transport })).state).toBe("skipped");
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("one message for every refusal (L3)", () => {
  it("does not tell an unresolvable name from a private address", async () => {
    const unresolvable = await assertWebhookUrl(
      "https://nope.example.com/x",
      async () => {
        throw new Error("ENOTFOUND");
      }
    ).catch((e) => e);
    const privateHost = await assertWebhookUrl(
      "https://sneaky.example.com/x",
      async () => ["10.0.0.9"]
    ).catch((e) => e);
    const literal = await assertWebhookUrl(
      "https://10.0.0.9/x",
      publicHost
    ).catch((e) => e);
    expect(unresolvable.code).toBe("INVALID");
    expect(privateHost.message).toBe(unresolvable.message);
    expect(literal.message).toBe(unresolvable.message);
    expect(unresolvable.message).not.toMatch(
      /resolve|private|public address\./i
    );
  });
});

describe("plan downgrade mid-retry (M3)", () => {
  it("a queued event and its retries stop when the plan has no webhooks, with no strike", async () => {
    (canUseHubWebhooks as jest.Mock).mockResolvedValue({ allowed: false });
    db.hubWebhookDelivery.findUnique.mockResolvedValue(
      delivery({ attempts: 2 })
    );
    const transport = jest.fn();
    const outcome = await attemptDelivery("d1", {
      transport,
      resolve: publicHost,
      now: () => NOW,
    });
    expect(outcome.state).toBe("skipped");
    expect(transport).not.toHaveBeenCalled();
    expect(db.hubWebhookDelivery.update.mock.calls[0][0].data).toMatchObject({
      status: "failed",
      lastError: "Plan has no webhooks.",
      nextAttemptAt: null,
    });
    expect(db.hubWebhook.update).not.toHaveBeenCalled();
    expect(canUseHubWebhooks).toHaveBeenCalledWith("u1");
  });
});

describe("test events do not touch the real failure streak (L1)", () => {
  const testDelivery = (hook: object = {}) =>
    delivery({ event: HUB_WEBHOOK_TEST_EVENT }, { userId: "u1", ...hook });

  it("a failing test is one try, is not retried and adds no strike", async () => {
    db.hubWebhookDelivery.findUnique.mockResolvedValue(testDelivery());
    const outcome = await attemptDelivery("d1", {
      transport: jest.fn().mockResolvedValue({ status: 500 }),
      resolve: publicHost,
      now: () => NOW,
    });
    expect(outcome).toEqual({ state: "failed", disabled: false });
    expect(db.hubWebhookDelivery.update.mock.calls[0][0].data).toMatchObject({
      status: "failed",
      nextAttemptAt: null,
    });
    expect(db.hubWebhook.update).not.toHaveBeenCalled();
  });

  it("a passing test does not reset a real streak", async () => {
    db.hubWebhookDelivery.findUnique.mockResolvedValue(
      testDelivery({ consecutiveFailures: 12 })
    );
    const outcome = await attemptDelivery("d1", {
      transport: jest.fn().mockResolvedValue({ status: 200 }),
      resolve: publicHost,
      now: () => NOW,
    });
    expect(outcome.state).toBe("success");
    expect(db.hubWebhook.update).not.toHaveBeenCalled();
  });
});

describe("the real transport", () => {
  it("refuses to connect to a name that resolves to a private address", async () => {
    // localhost resolves to loopback; guardedLookup must stop the connection.
    await expect(
      httpsWebhookTransport(new URL("https://localhost/x"), {
        body: "{}",
        headers: {},
      })
    ).rejects.toMatchObject({ code: "EBLOCKED" });
  });
});
