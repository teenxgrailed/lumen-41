import { NextRequest } from "next/server";

import { GET } from "@/app/api/weather/cities/route";
import { searchCities } from "@/services/weather/open-meteo";

import { authenticateRequest } from "@/lib/auth/api-auth";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/services/weather/open-meteo", () => ({
  ...jest.requireActual("@/services/weather/open-meteo"),
  searchCities: jest.fn(),
}));

const call = (q?: string) =>
  GET(
    new NextRequest(
      `http://localhost/api/weather/cities${q === undefined ? "" : `?q=${encodeURIComponent(q)}`}`
    )
  ) as Promise<Response>;

beforeEach(() => {
  jest.clearAllMocks();
  (authenticateRequest as jest.Mock).mockResolvedValue({ userId: "u1" });
});

it("answers the suggestions for what was typed", async () => {
  const cities = [{ name: "Zürich", latitude: 47.37, longitude: 8.55 }];
  (searchCities as jest.Mock).mockResolvedValue(cities);
  const res = await call("zur");
  expect(await res.json()).toEqual({ cities });
  expect(searchCities).toHaveBeenCalledWith("zur");
  expect(res.headers.get("cache-control")).toContain("no-store");
});

it("needs a signed-in person", async () => {
  const response = new Response(null, { status: 401 });
  (authenticateRequest as jest.Mock).mockResolvedValue({ response });
  expect((await call("zur")).status).toBe(401);
  expect(searchCities).not.toHaveBeenCalled();
});

it("says suggestions are unavailable when the service is down", async () => {
  (searchCities as jest.Mock).mockRejectedValue(new Error("down"));
  const res = await call("zur");
  expect(res.status).toBe(502);
  expect((await res.json()).cities).toEqual([]);
});
