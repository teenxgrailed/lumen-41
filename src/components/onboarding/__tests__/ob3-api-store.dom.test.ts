/**
 * @jest-environment jsdom
 *
 * A closed registration is worded for the website by the server; a store build
 * (iOS app, Mac App Store) names no website.
 */
import { registerEmail } from "../ob3-api";

const closed = () =>
  jest.fn(async () => ({
    ok: false,
    status: 403,
    json: async () => ({
      error: "Registration is closed — join the waitlist at needt.app",
      code: "SIGNUPS_CLOSED",
    }),
  }));

afterEach(() => {
  delete (window as unknown as { __needtNative?: unknown }).__needtNative;
});

describe("registerEmail on closed sign-ups", () => {
  it("browser: the server's wording", async () => {
    (globalThis as { fetch?: unknown }).fetch = closed();
    await expect(
      registerEmail("a@example.com", "pw", "", true)
    ).rejects.toThrow("needt.app");
  });

  it("store build: Sign-ups are closed right now.", async () => {
    (window as unknown as { __needtNative?: unknown }).__needtNative = {
      platform: "mac-swift",
      distribution: "appstore",
    };
    (globalThis as { fetch?: unknown }).fetch = closed();
    await expect(
      registerEmail("a@example.com", "pw", "", true)
    ).rejects.toThrow("Sign-ups are closed right now.");
  });
});
