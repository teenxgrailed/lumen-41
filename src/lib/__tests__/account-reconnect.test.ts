import { accountNeedsReconnect } from "../account-reconnect";

describe("accountNeedsReconnect", () => {
  it("needs a reconnect only when every synced calendar is failing", () => {
    expect(
      accountNeedsReconnect([
        { enabled: true, error: "invalid_grant" },
        { enabled: true, error: "401" },
      ])
    ).toBe(true);
    expect(
      accountNeedsReconnect([
        { enabled: true, error: "invalid_grant" },
        { enabled: true, error: null },
      ])
    ).toBe(false);
  });

  it("ignores disabled calendars and an account with none", () => {
    expect(
      accountNeedsReconnect([
        { enabled: true, error: "x" },
        { enabled: false, error: null },
      ])
    ).toBe(true);
    expect(accountNeedsReconnect([])).toBe(false);
    expect(accountNeedsReconnect([{ enabled: false, error: "x" }])).toBe(false);
  });
});
