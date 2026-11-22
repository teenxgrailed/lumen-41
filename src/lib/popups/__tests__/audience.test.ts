import {
  type Audience,
  type AudienceFacts,
  compareVersions,
  matchesAudience,
} from "../audience";

const OPEN: Audience = {
  plans: [],
  platforms: [],
  minAppVersion: null,
  signedUpBefore: null,
  signedUpAfter: null,
  minActiveDays: null,
};

const FACTS: AudienceFacts = {
  plan: "FREE",
  platform: "web",
  appVersion: "1.10.0",
  signedUpAt: new Date("2026-06-01T00:00:00Z"),
  activeDays: 10,
};

const match = (a: Partial<Audience>, f: Partial<AudienceFacts> = {}) =>
  matchesAudience({ ...OPEN, ...a }, { ...FACTS, ...f });

describe("compareVersions", () => {
  it("compares numerically, not as text", () => {
    expect(compareVersions("1.10.0", "1.9.2")).toBe(1);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("0.9.9", "1.0.0")).toBe(-1);
  });
});

describe("matchesAudience", () => {
  it("matches everybody when nothing is restricted", () => {
    expect(match({})).toBe(true);
  });

  it("filters by plan", () => {
    expect(match({ plans: ["FREE", "TRIAL"] })).toBe(true);
    expect(match({ plans: ["PRO", "LIFETIME"] })).toBe(false);
    expect(match({ plans: ["TRIAL"] }, { plan: "TRIAL" })).toBe(true);
  });

  it("filters by platform", () => {
    expect(match({ platforms: ["ios", "mac"] })).toBe(false);
    expect(match({ platforms: ["ios", "mac"] }, { platform: "mac" })).toBe(true);
  });

  it("requires the minimum app version", () => {
    expect(match({ minAppVersion: "1.9.0" })).toBe(true);
    expect(match({ minAppVersion: "1.10.0" })).toBe(true);
    expect(match({ minAppVersion: "1.11.0" })).toBe(false);
  });

  it("does not show a version-gated popup to a client that reports no version", () => {
    expect(match({ minAppVersion: "1.0.0" }, { appVersion: null })).toBe(false);
  });

  it("filters by signup date", () => {
    const cut = new Date("2026-09-01T00:00:00Z");
    expect(match({ signedUpBefore: cut })).toBe(true);
    expect(match({ signedUpAfter: cut })).toBe(false);
    expect(match({ signedUpBefore: new Date("2026-06-01T00:00:00Z") })).toBe(
      false
    );
  });

  it("requires the minimum active days", () => {
    expect(match({ minActiveDays: 10 })).toBe(true);
    expect(match({ minActiveDays: 11 })).toBe(false);
    expect(match({ minActiveDays: 0 }, { activeDays: 0 })).toBe(true);
  });

  it("needs every rule to hold", () => {
    expect(match({ plans: ["FREE"], platforms: ["web"], minActiveDays: 5 })).toBe(
      true
    );
    expect(match({ plans: ["FREE"], platforms: ["web"], minActiveDays: 50 })).toBe(
      false
    );
  });
});
