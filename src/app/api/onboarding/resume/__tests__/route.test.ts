import { getServerSession } from "next-auth";
import { NextRequest } from "next/server";

import { isFeatureEnabled } from "@/lib/feature-flags";

import { GET } from "../route";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/auth-options", () => ({
  getAuthOptions: jest.fn().mockResolvedValue({}),
}));
jest.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const request = (query = "") =>
  new NextRequest(`http://localhost/api/onboarding/resume${query}`);

const signedIn = () =>
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "u1" } });

describe("GET /api/onboarding/resume", () => {
  beforeEach(() => jest.mocked(isFeatureEnabled).mockReset());

  it("sends a signed-out caller to sign-in", async () => {
    jest.mocked(getServerSession).mockResolvedValue(null);
    const response = await GET(request());
    expect(response.headers.get("location")).toMatch(/\/auth\/signin$/);
  });

  it("sends a new account to /start when onboarding_v3 is on", async () => {
    signedIn();
    jest.mocked(isFeatureEnabled).mockResolvedValue(true);
    const response = await GET(request());
    expect(new URL(response.headers.get("location")!).pathname).toBe("/start");
    expect(isFeatureEnabled).toHaveBeenCalledWith("onboarding_v3", "u1");
  });

  it("sends it to /setup when the flag is off", async () => {
    signedIn();
    jest.mocked(isFeatureEnabled).mockResolvedValue(false);
    const response = await GET(request("?callbackUrl=%2Fcalendar"));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/setup");
  });

  it("returns an OAuth sign-up begun in /start to its step", async () => {
    signedIn();
    jest.mocked(isFeatureEnabled).mockResolvedValue(false);
    const response = await GET(
      request(`?callbackUrl=${encodeURIComponent("/start?step=verify")}`)
    );
    const location = new URL(response.headers.get("location")!);
    expect(`${location.pathname}${location.search}`).toBe("/start?step=verify");
  });

  it("marks the Today redirect so it happens once", async () => {
    signedIn();
    jest.mocked(isFeatureEnabled).mockResolvedValue(true);
    const response = await GET(request("?from=today"));
    expect(response.cookies.get("needt-ob-resumed")?.value).toBe("1");
    const plain = await GET(request());
    expect(plain.cookies.get("needt-ob-resumed")).toBeUndefined();
  });
});
