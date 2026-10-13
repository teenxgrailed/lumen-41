import { everyoneSeesV3 } from "@/lib/needt3/auth-design";

jest.mock("@/lib/prisma", () => ({
  prisma: { featureFlag: { findUnique: jest.fn() } },
}));
jest.mock("@/lib/needt3/design-flag", () => ({ isDesignV3: jest.fn() }));
jest.mock("@/lib/logger", () => ({ logger: { error: jest.fn() } }));

describe("who gets the v3 sign-in screen", () => {
  it("nobody while the flag is missing or off", () => {
    expect(everyoneSeesV3(null)).toBe(false);
    expect(everyoneSeesV3({ enabled: false, rolloutPercentage: 100 })).toBe(
      false
    );
  });

  it("a partial rollout never changes what a stranger sees", () => {
    expect(everyoneSeesV3({ enabled: true, rolloutPercentage: 0 })).toBe(false);
    expect(everyoneSeesV3({ enabled: true, rolloutPercentage: 99 })).toBe(
      false
    );
  });

  it("everyone once it is enabled at 100 %", () => {
    expect(everyoneSeesV3({ enabled: true, rolloutPercentage: 100 })).toBe(
      true
    );
  });
});
