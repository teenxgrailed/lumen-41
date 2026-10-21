import { NextRequest, NextResponse } from "next/server";

import { createHash } from "node:crypto";

import { calendarOAuthStateCookieValue } from "@/lib/calendar-oauth";
import {
  clearMailOAuthCookies,
  createMailOAuthSession,
  mailOAuthCookieOptions,
  mailOAuthStateCookie,
  mailOAuthVerifierCookie,
  setMailOAuthCookies,
  verifyMailOAuthCallback,
} from "@/lib/mail/oauth-state";

function request(
  query: Record<string, string>,
  cookies: Record<string, string>
) {
  const url = new URL("https://use.needt.app/api/mail/oauth/google/callback");
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, {
    headers: {
      cookie: Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; "),
    },
  });
}

describe("mail OAuth state", () => {
  it("uses its own cookie names and path, not the calendar ones", () => {
    expect(mailOAuthStateCookie("google")).toBe(
      "needt-mail-oauth-state-google"
    );
    expect(mailOAuthStateCookie("outlook")).toBe(
      "needt-mail-oauth-state-outlook"
    );
    expect(mailOAuthVerifierCookie("google")).toBe(
      "needt-mail-oauth-verifier-google"
    );
    expect(mailOAuthCookieOptions()).toMatchObject({
      httpOnly: true,
      maxAge: 600,
      path: "/api/mail/oauth",
      sameSite: "lax",
    });
  });

  it("creates a fresh state and a matching S256 challenge each time", () => {
    const first = createMailOAuthSession();
    const second = createMailOAuthSession();
    expect(first.state).toMatch(/^[a-f0-9]{64}$/);
    expect(first.state).not.toBe(second.state);
    expect(first.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.codeVerifier).not.toBe(second.codeVerifier);
    expect(first.codeChallenge).toBe(
      createHash("sha256").update(first.codeVerifier).digest("base64url")
    );
  });

  it("accepts the state it issued, for the user it was issued to", () => {
    const session = createMailOAuthSession();
    const response = setMailOAuthCookies(
      NextResponse.next(),
      "google",
      "user-1",
      session
    );
    const cookies = {
      [mailOAuthStateCookie("google")]: response.cookies.get(
        mailOAuthStateCookie("google")
      )!.value,
      [mailOAuthVerifierCookie("google")]: response.cookies.get(
        mailOAuthVerifierCookie("google")
      )!.value,
    };
    expect(
      verifyMailOAuthCallback(
        request({ state: session.state }, cookies),
        "google",
        "user-1"
      )
    ).toEqual({ valid: true, codeVerifier: session.codeVerifier });
    expect(
      verifyMailOAuthCallback(
        request({ state: session.state }, cookies),
        "google",
        "user-2"
      )
    ).toEqual({ valid: false });
  });

  it("does not accept a cookie issued for the other provider", () => {
    const session = createMailOAuthSession();
    const cookies = {
      [mailOAuthStateCookie("outlook")]: calendarOAuthStateCookieValue(
        session.state,
        "user-1"
      ),
      [mailOAuthVerifierCookie("outlook")]: session.codeVerifier,
    };
    expect(
      verifyMailOAuthCallback(
        request({ state: session.state }, cookies),
        "google",
        "user-1"
      )
    ).toEqual({ valid: false });
  });

  it("rejects a malformed PKCE verifier", () => {
    const session = createMailOAuthSession();
    const cookies = {
      [mailOAuthStateCookie("google")]: calendarOAuthStateCookieValue(
        session.state,
        "user-1"
      ),
      [mailOAuthVerifierCookie("google")]: "short",
    };
    expect(
      verifyMailOAuthCallback(
        request({ state: session.state }, cookies),
        "google",
        "user-1"
      )
    ).toEqual({ valid: false });
  });

  it("expires both cookies on the path they were set on", () => {
    const response = clearMailOAuthCookies(NextResponse.next(), "outlook");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("needt-mail-oauth-state-outlook=;");
    expect(setCookie).toContain("needt-mail-oauth-verifier-outlook=;");
    expect(setCookie).toContain("Path=/api/mail/oauth");
    expect(setCookie).toContain("Max-Age=0");
  });
});
