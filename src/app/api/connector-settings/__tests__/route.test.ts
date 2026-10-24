import { NextRequest } from "next/server";

import {
  CONNECTOR_TOKEN_LIFETIME_DAYS,
  connectorTokenExpiresAt,
  hashConnectorToken,
  isConnectorTokenExpired,
} from "@/services/connectors/auth-tokens";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

import { GET, POST } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    connectorSettings: { upsert: jest.fn(), update: jest.fn() },
  },
}));

const upsert = prisma.connectorSettings.upsert as jest.Mock;
const update = prisma.connectorSettings.update as jest.Mock;
const DAY = 24 * 60 * 60 * 1_000;

const base = {
  userId: "user-1",
  tokenHash: "hash",
  tokenPreview: "needt_abcd...wxyz",
  tokenExpiresAt: null as Date | null,
  webhookUrl: null,
  webhookSchedule: false,
  webhookTaskComplete: false,
};

const call = async (handler: typeof GET, method: string) => {
  const response = await handler(
    new NextRequest("http://localhost/api/connector-settings", { method })
  );
  if (!response) throw new Error("Expected a route response.");
  return response;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(authenticateRequest)
    .mockResolvedValue({ userId: "user-1" } as never);
  upsert.mockResolvedValue(base);
  update.mockImplementation(async ({ data }) => ({ ...base, ...data }));
});

describe("connector token expiry", () => {
  it("gives a new token one year and returns the date", async () => {
    const before = Date.now();
    const response = await call(POST, "POST");
    const body = await response.json();

    const data = update.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(hashConnectorToken(body.token));
    const lifetime = data.tokenExpiresAt.getTime() - before;
    expect(lifetime).toBeGreaterThan((CONNECTOR_TOKEN_LIFETIME_DAYS - 1) * DAY);
    expect(lifetime).toBeLessThan((CONNECTOR_TOKEN_LIFETIME_DAYS + 1) * DAY);
    expect(body.tokenExpiresAt).toBe(data.tokenExpiresAt.toISOString());
    expect(body.tokenExpired).toBe(false);
  });

  it("reports a token made before expiry existed as not expiring", async () => {
    const body = await (await call(GET, "GET")).json();
    expect(body).toMatchObject({
      hasToken: true,
      tokenExpiresAt: null,
      tokenExpired: false,
    });
  });

  it("reports an expired token", async () => {
    const past = new Date(Date.now() - DAY);
    upsert.mockResolvedValue({ ...base, tokenExpiresAt: past });
    const body = await (await call(GET, "GET")).json();
    expect(body).toMatchObject({
      tokenExpiresAt: past.toISOString(),
      tokenExpired: true,
    });
  });

  it("reports nothing when there is no token", async () => {
    upsert.mockResolvedValue({ ...base, tokenHash: null, tokenPreview: null });
    const body = await (await call(GET, "GET")).json();
    expect(body).toMatchObject({
      hasToken: false,
      tokenExpiresAt: null,
      tokenExpired: false,
    });
  });
});

describe("auth-tokens helpers", () => {
  it("expires a year after creation, and only on or after the date", () => {
    const now = new Date("2026-10-23T12:00:00Z");
    const at = connectorTokenExpiresAt(now);
    // Calendar days in the process zone: a DST shift may move it by an hour.
    expect(Math.abs(at.getTime() - now.getTime() - 365 * DAY)).toBeLessThan(
      2 * 60 * 60 * 1_000
    );
    expect(isConnectorTokenExpired(at, new Date(at.getTime() - 1))).toBe(false);
    expect(isConnectorTokenExpired(at, at)).toBe(true);
    expect(isConnectorTokenExpired(null, now)).toBe(false);
  });
});
