import {
  getAppleIapConfig,
  isAppleIapConfigured,
  mayUseAppleSandbox,
} from "../config";

const env = (values: Record<string, string>) =>
  values as unknown as NodeJS.ProcessEnv;

describe("Apple IAP config", () => {
  it("an unset environment is not configured in production", () => {
    const config = getAppleIapConfig(env({ NODE_ENV: "production" }));
    expect(config.environment).toBeNull();
    expect(isAppleIapConfigured(config)).toBe(false);
  });

  it("a typo is not configured in production either", () => {
    const config = getAppleIapConfig(
      env({ NODE_ENV: "production", APPLE_IAP_ENVIRONMENT: "Prod" })
    );
    expect(config.environment).toBeNull();
  });

  it("an unset environment is Sandbox in development", () => {
    const config = getAppleIapConfig(env({ NODE_ENV: "development" }));
    expect(config.environment).toBe("Sandbox");
    expect(isAppleIapConfigured(config)).toBe(true);
  });

  it("Production needs the App Apple ID", () => {
    const base = {
      NODE_ENV: "production",
      APPLE_IAP_ENVIRONMENT: "Production",
    };
    expect(isAppleIapConfigured(getAppleIapConfig(env(base)))).toBe(false);
    expect(
      isAppleIapConfigured(
        getAppleIapConfig(
          env({ ...base, APPLE_IAP_APP_APPLE_ID: "6400000000" })
        )
      )
    ).toBe(true);
  });

  it("Sandbox is honoured for the reviewer and for listed testers only", () => {
    const config = getAppleIapConfig(
      env({
        NODE_ENV: "production",
        APPLE_IAP_ENVIRONMENT: "Production",
        APPLE_IAP_SANDBOX_TESTERS: " Owner@Example.test , other@example.test",
      })
    );
    expect(
      mayUseAppleSandbox({ sandboxKind: "reviewer", email: null }, config)
    ).toBe(true);
    const verified = new Date("2026-10-01T00:00:00Z");
    expect(
      mayUseAppleSandbox(
        {
          sandboxKind: null,
          email: "owner@example.TEST",
          emailVerified: verified,
        },
        config
      )
    ).toBe(true);
    // A tester's address nobody confirmed (signed up first by someone else).
    expect(
      mayUseAppleSandbox(
        { sandboxKind: null, email: "owner@example.test", emailVerified: null },
        config
      )
    ).toBe(false);
    expect(
      mayUseAppleSandbox(
        {
          sandboxKind: null,
          email: "someone@example.test",
          emailVerified: verified,
        },
        config
      )
    ).toBe(false);
    expect(
      mayUseAppleSandbox({ sandboxKind: "publicDemo", email: null }, config)
    ).toBe(false);
  });
});
