import { oauthErrorMessage } from "@/lib/auth/oauth-error";

describe("OAuth error messages", () => {
  it("explains how to recover from an account mismatch", () => {
    expect(oauthErrorMessage("OAuthAccountNotLinked")).toContain(
      "method you used before"
    );
  });

  it("does not echo unknown provider errors", () => {
    expect(oauthErrorMessage("secret-provider-detail")).not.toContain(
      "secret-provider-detail"
    );
  });

  it("points a refused new account at the waitlist", () => {
    expect(oauthErrorMessage("SignupsClosed")).toContain("needt.app");
  });
});
