/**
 * @jest-environment jsdom
 */
import { fetchPublicSignup, signupFlags } from "../public-signup-state";

jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const answer = (r: unknown) => {
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => {
    if (r === "throw") throw new Error("offline");
    return r;
  });
};

describe("fetchPublicSignup", () => {
  it("true and false are the server's answer", async () => {
    answer({ ok: true, json: async () => ({ enabled: true }) });
    await expect(fetchPublicSignup()).resolves.toBe(true);
    answer({ ok: true, json: async () => ({ enabled: false }) });
    await expect(fetchPublicSignup()).resolves.toBe(false);
  });

  it.each([
    [
      "a server error (the route answers 500 with enabled:false)",
      { ok: false, json: async () => ({ enabled: false }) },
    ],
    ["a network error", "throw"],
    ["an answer without the flag", { ok: true, json: async () => ({}) }],
    [
      "a flag that is not a boolean",
      { ok: true, json: async () => ({ enabled: "yes" }) },
    ],
    [
      "an unreadable body",
      { ok: true, json: async () => Promise.reject(new Error("x")) },
    ],
  ])("%s is unknown (null), never closed", async (_n, r) => {
    answer(r);
    await expect(fetchPublicSignup()).resolves.toBeNull();
  });
});

describe("signupFlags", () => {
  it("open offers Create one", () =>
    expect(signupFlags(true)).toEqual({
      allowSignup: true,
      signupClosed: false,
    }));
  it("closed offers the waitlist", () =>
    expect(signupFlags(false)).toEqual({
      allowSignup: false,
      signupClosed: true,
    }));
  it("unknown offers neither", () =>
    expect(signupFlags(null)).toEqual({
      allowSignup: false,
      signupClosed: false,
    }));
});
