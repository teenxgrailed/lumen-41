import { NextRequest } from "next/server";

import { GET } from "@/app/api/weather/route";
import { weatherFor } from "@/services/weather/open-meteo";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: { userSettings: { findUnique: jest.fn() } },
}));
jest.mock("@/services/weather/open-meteo", () => ({
  ...jest.requireActual("@/services/weather/open-meteo"),
  weatherFor: jest.fn(),
}));

const find = prisma.userSettings.findUnique as jest.Mock;
const call = () =>
  GET(new NextRequest("http://localhost/api/weather")) as Promise<Response>;

beforeEach(() => {
  jest.clearAllMocks();
  (authenticateRequest as jest.Mock).mockResolvedValue({ userId: "u1" });
});

it("asks no one while the city is empty", async () => {
  find.mockResolvedValue({ prefs: { city: "  " } });
  expect((await (await call()).json()).weather).toBeNull();
  find.mockResolvedValue({ prefs: {} });
  expect((await (await call()).json()).weather).toBeNull();
  find.mockResolvedValue(null);
  expect((await (await call()).json()).weather).toBeNull();
  expect(weatherFor).not.toHaveBeenCalled();
});

it("looks up the saved city", async () => {
  find.mockResolvedValue({ prefs: { city: "Kyiv" } });
  (weatherFor as jest.Mock).mockResolvedValue({ city: "Kyiv", temp: 14 });
  const res = await call();
  expect((await res.json()).weather).toEqual({ city: "Kyiv", temp: 14 });
  expect(weatherFor).toHaveBeenCalledWith("Kyiv");
  expect(find.mock.calls[0][0].where).toEqual({ userId: "u1" });
  expect(res.headers.get("cache-control")).toContain("no-store");
});
