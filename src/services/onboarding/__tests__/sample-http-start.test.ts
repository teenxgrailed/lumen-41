import { isFeatureEnabled } from "@/lib/feature-flags";

import { seedFirstReplanDemo } from "../first-replan-demo";
import { seedFirstReplanDemoAfterStart } from "../sample-http";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../first-replan-demo", () => ({ seedFirstReplanDemo: jest.fn() }));
jest.mock("../sample-service", () => ({}));

const input = { userId: "u1", workspaceId: "w1", timeZone: "Europe/Zurich" };

describe("seedFirstReplanDemoAfterStart", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(seedFirstReplanDemo).mockResolvedValue({ created: true });
  });

  it("seeds the demo when first_replan_onboarding is on", async () => {
    jest.mocked(isFeatureEnabled).mockResolvedValue(true);
    await seedFirstReplanDemoAfterStart(input);
    expect(seedFirstReplanDemo).toHaveBeenCalledWith(input);
  });

  it("does nothing when the flag is off", async () => {
    jest.mocked(isFeatureEnabled).mockResolvedValue(false);
    await seedFirstReplanDemoAfterStart(input);
    expect(seedFirstReplanDemo).not.toHaveBeenCalled();
  });

  it("does nothing, and does not throw, when the flag read fails", async () => {
    jest.mocked(isFeatureEnabled).mockRejectedValue(new Error("db"));
    await expect(seedFirstReplanDemoAfterStart(input)).resolves.toBeUndefined();
    expect(seedFirstReplanDemo).not.toHaveBeenCalled();
  });

  it("never throws when seeding fails", async () => {
    jest.mocked(isFeatureEnabled).mockResolvedValue(true);
    jest.mocked(seedFirstReplanDemo).mockRejectedValue(new Error("boom"));
    await expect(seedFirstReplanDemoAfterStart(input)).resolves.toBeUndefined();
  });
});
