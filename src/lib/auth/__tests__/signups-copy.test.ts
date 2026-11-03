import {
  SIGNUPS_CLOSED_MESSAGE,
  signupsClosedMessage,
} from "@/lib/auth/signups-copy";

describe("closed registration wording", () => {
  it("the website wording names the waitlist", () => {
    expect(signupsClosedMessage(false)).toBe(SIGNUPS_CLOSED_MESSAGE);
    expect(SIGNUPS_CLOSED_MESSAGE).toContain("needt.app");
  });

  it("a store build says only that sign-ups are closed", () => {
    expect(signupsClosedMessage(true)).toBe("Sign-ups are closed right now.");
  });
});
