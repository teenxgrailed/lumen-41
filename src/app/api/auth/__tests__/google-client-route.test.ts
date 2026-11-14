import { NextRequest, NextResponse } from "next/server";

import {
  GET,
  resetGoogleClientCache,
} from "@/app/api/auth/google-client/route";

import { oneTapNonceCookieName } from "@/lib/auth/google-one-tap-nonce";
import {
  isProviderConfigured,
  readSignInProviderConfig,
} from "@/lib/auth/sign-in-providers";
import { enforceRateLimits, ipRule } from "@/lib/security/rate-limit";

jest.mock("@/lib/auth/auth-secret", () => ({
  authSecret: () => "test-secret-test-secret-test-secret",
}));
jest.mock("@/lib/auth/sign-in-providers", () => ({
  readSignInProviderConfig: jest.fn(),
  isProviderConfigured: jest.fn(),
}));
jest.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimits: jest.fn(),
  ipRule: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const request = () =>
  new NextRequest("http://localhost/api/auth/google-client");

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
  jest.resetAllMocks();
  resetGoogleClientCache();
  jest.mocked(enforceRateLimits).mockResolvedValue(null);
  jest
    .mocked(ipRule)
    .mockImplementation(
      (_r, namespace, limit) =>
        ({ identifier: "ip", namespace, limit }) as never
    );
  jest.mocked(readSignInProviderConfig).mockResolvedValue({
    google: { clientId: "id.apps", clientSecret: "x" },
  } as never);
  jest.mocked(isProviderConfigured).mockReturnValue(true);
});

describe("GET /api/auth/google-client", () => {
  it("is limited per IP", async () => {
    await GET(request());
    expect(ipRule).toHaveBeenCalledWith(
      expect.anything(),
      "onetap-config:ip",
      60,
      15 * 60
    );
    jest
      .mocked(enforceRateLimits)
      .mockResolvedValue(NextResponse.json({}, { status: 429 }));
    expect((await GET(request())).status).toBe(429);
  });

  it("sets one cookie per nonce, so a second call does not overwrite the first", async () => {
    const first = await GET(request());
    const second = await GET(request());
    const a = (await first.json()).nonce as string;
    const b = (await second.json()).nonce as string;
    expect(a).not.toBe(b);
    expect(first.cookies.get(oneTapNonceCookieName(a))).toBeDefined();
    expect(second.cookies.get(oneTapNonceCookieName(b))).toBeDefined();
    expect(first.cookies.get(oneTapNonceCookieName(b))).toBeUndefined();
  });

  it("keeps at most two nonce cookies in the browser, however often it is asked", async () => {
    /* A browser jar: Set-Cookie with Max-Age=0 removes, anything else stores. */
    const jar = new Map<string, string>();
    for (let i = 0; i < 50; i += 1) {
      const header = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
      const response = await GET(
        new NextRequest("http://localhost/api/auth/google-client", {
          headers: header ? { cookie: header } : {},
        })
      );
      for (const line of response.headers.getSetCookie()) {
        const [pair] = line.split(";");
        const eq = pair.indexOf("=");
        const name = pair.slice(0, eq);
        if (line.includes("Max-Age=0")) jar.delete(name);
        else jar.set(name, pair.slice(eq + 1));
      }
      expect(jar.size).toBeLessThanOrEqual(2);
      /* Each issue is a fresh expiry second so "newest" is well defined. */
      jest.setSystemTime(Date.now() + 1000);
    }
    expect(jar.size).toBe(2);
  });

  it("reads the Google config once within a few seconds", async () => {
    await GET(request());
    await GET(request());
    await GET(request());
    expect(readSignInProviderConfig).toHaveBeenCalledTimes(1);
  });

  it("answers nulls and sets no cookie when Google is not configured", async () => {
    jest.mocked(isProviderConfigured).mockReturnValue(false);
    const response = await GET(request());
    expect(await response.json()).toEqual({ clientId: null, nonce: null });
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });
});

afterEach(() => {
  jest.useRealTimers();
});
