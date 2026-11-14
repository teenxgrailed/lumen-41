import { NextRequest, NextResponse } from "next/server";

import { POST } from "@/app/api/auth/[...nextauth]/route";

import { oneTapNonceCookieName } from "@/lib/auth/google-one-tap-nonce";
import { enforceRateLimits, ipRule } from "@/lib/security/rate-limit";

const handler = jest.fn();
jest.mock("next-auth", () => ({
  __esModule: true,
  default: jest.fn(
    () =>
      (...args: unknown[]) =>
        handler(...args)
  ),
}));
jest.mock("@/lib/auth/auth-options", () => ({
  getAuthOptions: jest.fn(async () => ({})),
}));
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(),
  ipRule: jest.fn(),
  clearCredentialFailures: jest.fn(),
  enforceCredentialLock: jest.fn(),
  enforceRateLimits: jest.fn(),
  recordCredentialFailure: jest.fn(),
}));

const NONCE = "nonce-abc";
const credential = `h.${Buffer.from(JSON.stringify({ nonce: NONCE })).toString(
  "base64url"
)}.s`;

function tapRequest(cookie = `${oneTapNonceCookieName(NONCE)}=v.1.s`) {
  return new NextRequest("http://localhost/api/auth/callback/google-onetap", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ credential }),
  });
}
const context = { params: Promise.resolve({ nextauth: ["callback"] }) };
const cleared = (response: Response) =>
  response.headers
    .getSetCookie()
    .some((c) => c.startsWith(`${oneTapNonceCookieName(NONCE)}=;`));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(enforceRateLimits).mockResolvedValue(null);
  jest
    .mocked(ipRule)
    .mockImplementation(
      (_r, namespace, limit) =>
        ({ identifier: "ip", namespace, limit }) as never
    );
});

describe("POST /api/auth/callback/google-onetap", () => {
  it("clears this nonce's cookie after a sign-in", async () => {
    handler.mockResolvedValue(
      NextResponse.json({ url: "http://localhost/calendar" })
    );
    const response = await POST(tapRequest(), context);
    expect(cleared(response)).toBe(true);
  });

  it("clears every nonce cookie of the browser after a sign-in, not only its own", async () => {
    handler.mockResolvedValue(
      NextResponse.json({ url: "http://localhost/calendar" })
    );
    const response = await POST(
      tapRequest(
        `${oneTapNonceCookieName(NONCE)}=v.1.s; needt_onetap_nonce_aaaa=v.2.s; needt_onetap_nonce_bbbb=v.3.s; other=keep`
      ),
      context
    );
    const names = response.headers
      .getSetCookie()
      .filter((c: string) => c.includes("Max-Age=0"))
      .map((c: string) => c.split("=")[0]);
    expect(names.sort()).toEqual(
      [
        oneTapNonceCookieName(NONCE),
        "needt_onetap_nonce_aaaa",
        "needt_onetap_nonce_bbbb",
      ].sort()
    );
  });

  it("clears it for a redirect whose callbackUrl contains error=", async () => {
    handler.mockResolvedValue(
      NextResponse.redirect("http://localhost/docs?note=error=1")
    );
    expect(cleared(await POST(tapRequest(), context))).toBe(true);
  });

  it("keeps the cookie after a refusal, so the same token can retry", async () => {
    handler.mockResolvedValue(
      NextResponse.json({
        url: "http://localhost/auth/signin?error=AgeConfirmRequired",
      })
    );
    expect(cleared(await POST(tapRequest(), context))).toBe(false);
  });

  it("keeps it after an error status", async () => {
    handler.mockResolvedValue(NextResponse.json({}, { status: 401 }));
    expect(cleared(await POST(tapRequest(), context))).toBe(false);
  });

  it("is limited per IP (onetap:ip, 20 per 15 minutes) and stops there", async () => {
    jest
      .mocked(enforceRateLimits)
      .mockResolvedValue(NextResponse.json({}, { status: 429 }));
    const response = await POST(tapRequest(), context);
    expect(response.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
    expect(ipRule).toHaveBeenCalledWith(
      expect.anything(),
      "onetap:ip",
      20,
      15 * 60
    );
  });
});
