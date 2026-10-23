import { createHash } from "node:crypto";

import { desktopChallengeFor } from "@/lib/auth/desktop-handoff";
import {
  DESKTOP_CHALLENGE_PATTERN,
  DESKTOP_VERIFIER_PATTERN,
} from "@/lib/auth/desktop-handoff-shape";
import {
  codeFromCallback,
  nativeChallengeFor,
  nativeCompletePath,
  nativeSignInUrl,
  newNativeVerifier,
  runNativeSignIn,
} from "@/lib/auth/native-sign-in";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/public-url", () => ({ publicRequestUrl: jest.fn() }));

const CODE = "A".repeat(43);

describe("native sign-in (iOS) PKCE helpers", () => {
  it("makes a verifier the server accepts and a challenge that matches the server's", async () => {
    const verifier = newNativeVerifier();
    expect(DESKTOP_VERIFIER_PATTERN.test(verifier)).toBe(true);
    const challenge = await nativeChallengeFor(verifier);
    expect(DESKTOP_CHALLENGE_PATTERN.test(challenge)).toBe(true);
    expect(challenge).toBe(desktopChallengeFor(verifier));
    expect(challenge).toBe(
      createHash("sha256").update(verifier).digest("base64url")
    );
  });

  it("never repeats a verifier", () => {
    expect(newNativeVerifier()).not.toBe(newNativeVerifier());
  });

  it("builds the sign-in URL for a known provider only, returning to the confirmation page", () => {
    const challenge = "B".repeat(43);
    const url = new URL(
      nativeSignInUrl("https://use.needt.app", "google", challenge) ?? ""
    );
    expect(url.origin + url.pathname).toBe("https://use.needt.app/auth/signin");
    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("callbackUrl")).toBe(
      `/auth/desktop?challenge=${challenge}&client=ios`
    );
    expect(
      nativeSignInUrl("https://use.needt.app", "evil", challenge)
    ).toBeNull();
  });

  it("takes only a well-formed code from a needt://auth link", () => {
    expect(codeFromCallback(`needt://auth?code=${CODE}`)).toBe(CODE);
    expect(codeFromCallback(`needt://other?code=${CODE}`)).toBeNull();
    expect(codeFromCallback(`https://needt.app/auth?code=${CODE}`)).toBeNull();
    expect(codeFromCallback("needt://auth?code=short")).toBeNull();
    expect(codeFromCallback("not a url")).toBeNull();
  });

  it("puts code and verifier in the fragment, never the query", () => {
    const verifier = newNativeVerifier();
    const path = nativeCompletePath(CODE, verifier) ?? "";
    expect(path.startsWith("/auth/desktop-complete#code=")).toBe(true);
    expect(path).not.toContain("?");
    expect(nativeCompletePath("bad", verifier)).toBeNull();
  });

  it("runs the whole round trip and keeps the verifier to itself", async () => {
    let seen = "";
    const result = await runNativeSignIn(
      "apple",
      async (url, scheme) => {
        seen = url;
        expect(scheme).toBe("needt");
        return { ok: true, url: `needt://auth?code=${CODE}` };
      },
      "https://use.needt.app"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const verifier = new URLSearchParams(result.path.split("#")[1]).get(
      "verifier"
    );
    expect(verifier).toBeTruthy();
    expect(seen).not.toContain(verifier as string);
    const challenge = new URL(
      new URL(seen).searchParams.get("callbackUrl") as string,
      "https://x"
    ).searchParams.get("challenge");
    expect(challenge).toBe(desktopChallengeFor(verifier as string));
  });

  it("passes a cancelled sheet and a garbled callback through as failures", async () => {
    expect(
      await runNativeSignIn(
        "google",
        async () => ({ ok: false, reason: "cancelled" }),
        "https://use.needt.app"
      )
    ).toEqual({ ok: false, reason: "cancelled" });
    expect(
      await runNativeSignIn(
        "google",
        async () => ({ ok: true, url: "needt://auth?code=nope" }),
        "https://use.needt.app"
      )
    ).toEqual({ ok: false, reason: "failed" });
  });
});
