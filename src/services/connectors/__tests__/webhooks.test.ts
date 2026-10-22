import { UnsafeFetchError, safeFetch } from "@/services/oauth/safe-fetch";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { sendConnectorWebhook } from "../webhooks";

jest.mock("@/lib/prisma", () => ({
  prisma: { connectorSettings: { findUnique: jest.fn() } },
}));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
jest.mock("@/services/oauth/safe-fetch", () => ({
  ...jest.requireActual("@/services/oauth/safe-fetch"),
  safeFetch: jest.fn(),
}));

const settings = jest.mocked(prisma.connectorSettings.findUnique);
const guardedFetch = jest.mocked(safeFetch);

const input = {
  userId: "user-1",
  event: "task.completed" as const,
  payload: { id: "t1" },
};

function configure(overrides: Record<string, unknown> = {}) {
  settings.mockResolvedValue({
    webhookUrl: "https://hooks.example.com/needt",
    webhookSchedule: true,
    webhookTaskComplete: true,
    ...overrides,
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  guardedFetch.mockResolvedValue(new Response(null, { status: 204 }));
});

describe("sendConnectorWebhook", () => {
  it("posts the event to the address in the settings through the guarded fetch", async () => {
    configure();
    await sendConnectorWebhook(input);

    expect(guardedFetch).toHaveBeenCalledTimes(1);
    const [url, init] = guardedFetch.mock.calls[0];
    expect(url).toBe("https://hooks.example.com/needt");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      event: "task.completed",
      payload: { id: "t1" },
    });
  });

  it("sends nothing without an address or for an event that is switched off", async () => {
    configure({ webhookUrl: null });
    await sendConnectorWebhook(input);
    configure({ webhookTaskComplete: false });
    await sendConnectorWebhook(input);
    expect(guardedFetch).not.toHaveBeenCalled();
  });

  it("does not fail the caller when the address points at an internal host", async () => {
    configure({ webhookUrl: "http://169.254.169.254/latest/meta-data" });
    guardedFetch.mockRejectedValue(
      new UnsafeFetchError("The host resolves to a non-public address.")
    );

    await expect(sendConnectorWebhook(input)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      "Connector webhook did not complete",
      expect.objectContaining({ userId: "user-1" }),
      "connector-webhooks"
    );
  });

  it("does not fail the caller on a network error either", async () => {
    configure();
    guardedFetch.mockRejectedValue(new Error("connect ECONNREFUSED"));
    await expect(sendConnectorWebhook(input)).resolves.toBeUndefined();
  });
});
