import { isNewTrialGrant } from "@/lib/trials/trial-service";

describe("isNewTrialGrant", () => {
  const now = new Date("2026-11-14T10:00:00.000Z");

  it("is true for a grant written by this call", () => {
    expect(isNewTrialGrant({ startedAt: new Date(now.getTime()) }, now)).toBe(
      true
    );
  });

  it("is false for an earlier grant or none", () => {
    expect(
      isNewTrialGrant({ startedAt: new Date("2026-11-01T00:00:00Z") }, now)
    ).toBe(false);
    expect(isNewTrialGrant(null, now)).toBe(false);
  });
});
