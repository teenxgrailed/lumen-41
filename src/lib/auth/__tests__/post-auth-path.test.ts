import { confirmedNext } from "@/components/needt3/auth/link-logic";

import {
  POST_AUTH_COOKIE,
  rememberPostAuthPath,
  takePostAuthPath,
} from "@/lib/auth/post-auth-path";

/** A cookie jar that behaves like document.cookie for one cookie. */
function jar() {
  let stored = "";
  return {
    get cookie() {
      return stored;
    },
    set cookie(value: string) {
      const [pair] = value.split(";");
      const [name, v] = [
        pair.slice(0, pair.indexOf("=")),
        pair.slice(pair.indexOf("=") + 1),
      ];
      stored = /Max-Age=0/.test(value) ? "" : `${name}=${v}`;
    },
  };
}

const LINK = "/settings?section=billing&checkout=pro-year";

describe("post-auth path (deep link across sign-up detours)", () => {
  it("keeps the exact URL, params included, and hands it back once", () => {
    const j = jar();
    rememberPostAuthPath(LINK, j);

    expect(j.cookie.startsWith(`${POST_AUTH_COOKIE}=`)).toBe(true);
    expect(takePostAuthPath(j)).toBe(LINK);
    expect(takePostAuthPath(j)).toBeNull();
  });

  it("keeps lifetime and month links too", () => {
    for (const link of [
      "/settings?section=billing&checkout=lifetime",
      "/settings?section=billing&checkout=pro-month",
    ]) {
      const j = jar();
      rememberPostAuthPath(link, j);
      expect(takePostAuthPath(j)).toBe(link);
    }
  });

  it("does not keep the default, auth pages or non-local URLs", () => {
    for (const value of [
      undefined,
      "/calendar",
      "/auth/signin?callbackUrl=%2Ftoday",
      "/setup",
      "https://evil.example/settings",
      "//evil.example",
    ]) {
      const j = jar();
      rememberPostAuthPath(value, j);
      expect(takePostAuthPath(j)).toBeNull();
    }
  });

  it("refuses a tampered cookie that is not a local path", () => {
    const j = jar();
    j.cookie = `${POST_AUTH_COOKIE}=${encodeURIComponent("https://evil.example")}`;
    expect(takePostAuthPath(j)).toBeNull();
  });
});

describe("after email confirmation", () => {
  it("goes to the remembered link, with the confirmed notice on Settings", () => {
    expect(confirmedNext(LINK)).toBe(`${LINK}&emailVerification=verified`);
    expect(confirmedNext("/today")).toBe("/today");
  });

  it("falls back to Settings when nothing was remembered", () => {
    expect(confirmedNext(null)).toBe("/settings?emailVerification=verified");
  });
});
