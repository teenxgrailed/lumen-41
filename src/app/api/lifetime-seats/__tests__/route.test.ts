import { NextRequest } from "next/server";

import {
  GET,
  OPTIONS,
  resetLifetimeSeatsCache,
} from "@/app/api/lifetime-seats/route";

import { lifetimeSeatsSold } from "@/lib/creem/lifetime-cap";

jest.mock("@/lib/creem/lifetime-cap", () => ({
  LIFETIME_BUYER_CAP: 300,
  lifetimeSeatsSold: jest.fn(),
}));

const sold = jest.mocked(lifetimeSeatsSold);

function get(origin?: string) {
  return new NextRequest("https://use.needt.app/api/lifetime-seats", {
    headers: origin ? { Origin: origin } : {},
  });
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-17T10:00:00Z"));
  jest.resetAllMocks();
  resetLifetimeSeatsCache();
  sold.mockResolvedValue(42);
});

afterEach(() => jest.useRealTimers());

describe("GET /api/lifetime-seats", () => {
  it("returns the real count and the cap with a 5 minute cache header", async () => {
    const response = await GET(get("https://needt.app"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sold: 42, total: 300 });
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://needt.app"
    );
  });

  it("answers from memory for 5 minutes, then counts again", async () => {
    await GET(get());
    sold.mockResolvedValue(43);
    jest.advanceTimersByTime(4 * 60 * 1000);
    const cachedAnswer = await GET(get());
    await expect(cachedAnswer.json()).resolves.toEqual({
      sold: 42,
      total: 300,
    });
    expect(sold).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(61 * 1000);
    const fresh = await GET(get());
    await expect(fresh.json()).resolves.toEqual({ sold: 43, total: 300 });
    expect(sold).toHaveBeenCalledTimes(2);
  });

  it("works without an Origin and sends no CORS allow header", async () => {
    const response = await GET(get());
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("refuses a browser on another origin", async () => {
    const response = await GET(get("https://evil.example"));
    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(sold).not.toHaveBeenCalled();
  });

  it("allows localhost outside production", async () => {
    const response = await GET(get("http://localhost:5173"));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:5173"
    );
  });

  it("does not cache a failure", async () => {
    sold.mockRejectedValueOnce(new Error("db down"));
    const failed = await GET(get());
    expect(failed.status).toBe(500);
    expect(failed.headers.get("Cache-Control")).toBe("no-store");

    const ok = await GET(get());
    expect(ok.status).toBe(200);
  });
});

describe("OPTIONS /api/lifetime-seats", () => {
  function preflight(origin: string) {
    return new NextRequest("https://use.needt.app/api/lifetime-seats", {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
    });
  }

  it("answers a preflight from the landing", () => {
    const response = OPTIONS(preflight("https://needt.app"));
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "GET"
    );
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("refuses another origin", () => {
    const response = OPTIONS(preflight("https://needt.app.evil.example"));
    expect(response.status).toBe(403);
  });
});
