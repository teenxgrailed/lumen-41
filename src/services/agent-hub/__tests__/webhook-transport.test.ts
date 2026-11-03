/**
 * The real webhook transport with node:https replaced by a fake request:
 * what it hands to https (guarded lookup, 10 s timeout, POST, body) and what
 * it does on a timeout. The address checks themselves are in
 * webhook-delivery.test.ts.
 */
import { guardedLookup } from "@/services/imports/safe-fetch";
import { EventEmitter } from "node:events";
import https from "node:https";

import { WEBHOOK_TIMEOUT_MS, httpsWebhookTransport } from "../webhook-delivery";

jest.mock("node:https", () => ({
  __esModule: true,
  default: { request: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/entitlements", () => ({ canUseHubWebhooks: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const request = https.request as unknown as jest.Mock;

class FakeRequest extends EventEmitter {
  end = jest.fn();
  destroy = jest.fn((error?: Error) => {
    if (error) this.emit("error", error);
  });
}

beforeEach(() => request.mockReset());

describe("httpsWebhookTransport", () => {
  it("POSTs the body through the guarded lookup with a 10 s timeout", async () => {
    const fake = new FakeRequest();
    request.mockImplementation((_url, _options, callback) => {
      fake.end.mockImplementation(() =>
        callback({ statusCode: 204, resume: jest.fn() })
      );
      return fake;
    });
    const result = await httpsWebhookTransport(
      new URL("https://hooks.example.com/x"),
      { body: '{"a":1}', headers: { "x-needt-event": "item.created" } }
    );
    expect(result).toEqual({ status: 204 });
    const options = request.mock.calls[0][1];
    expect(options.method).toBe("POST");
    expect(options.lookup).toBe(guardedLookup);
    expect(options.timeout).toBe(WEBHOOK_TIMEOUT_MS);
    expect(WEBHOOK_TIMEOUT_MS).toBe(10_000);
    expect(options.headers["x-needt-event"]).toBe("item.created");
    expect(options.headers["content-length"]).toBe("7");
    expect(fake.end).toHaveBeenCalledWith('{"a":1}');
  });

  it("gives up with a timeout error when the socket times out", async () => {
    const fake = new FakeRequest();
    request.mockImplementation(() => {
      fake.end.mockImplementation(() => fake.emit("timeout"));
      return fake;
    });
    await expect(
      httpsWebhookTransport(new URL("https://hooks.example.com/x"), {
        body: "{}",
        headers: {},
      })
    ).rejects.toThrow("timeout");
    expect(fake.destroy).toHaveBeenCalled();
  });

  it("passes a redirect status through so the caller counts it as a failure", async () => {
    const fake = new FakeRequest();
    request.mockImplementation((_u, _o, callback) => {
      fake.end.mockImplementation(() =>
        callback({ statusCode: 302, resume: jest.fn() })
      );
      return fake;
    });
    await expect(
      httpsWebhookTransport(new URL("https://hooks.example.com/x"), {
        body: "{}",
        headers: {},
      })
    ).resolves.toEqual({ status: 302 });
  });
});
