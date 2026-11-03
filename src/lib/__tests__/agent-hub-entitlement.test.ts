import { SubscriptionPlan } from "@prisma/client";

import {
  AGENT_HUB_PLANS,
  AGENT_HUB_REQUIRES_PLAN,
  canUseAgentHub,
} from "../entitlements";
import { agentHubEnabled } from "../feature-flags";

const prismaMock = {
  featureFlag: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
};
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return prismaMock;
  },
}));

const flag = (enabled: boolean) =>
  prismaMock.featureFlag.findUnique.mockResolvedValue({
    enabled: false,
    rolloutPercentage: 0,
    overrides: [{ enabled }],
  });

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({
    subscription: null,
    trialGrant: null,
  });
});

describe("the agent hub entitlement hook", () => {
  it("is for Pro and Lifetime once the plan is required, never Free", () => {
    expect(AGENT_HUB_PLANS).toEqual([
      SubscriptionPlan.PRO,
      SubscriptionPlan.LIFETIME,
    ]);
    expect(AGENT_HUB_PLANS).not.toContain(SubscriptionPlan.FREE);
  });

  it("is not required yet: the owner-only flag alone decides", async () => {
    expect(AGENT_HUB_REQUIRES_PLAN).toBe(false);
    // The account here is on Free, and still passes the plan side.
    expect((await canUseAgentHub("owner-1")).allowed).toBe(true);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("keeps the flag required: no override, no hub", async () => {
    prismaMock.featureFlag.findUnique.mockResolvedValue({
      enabled: false,
      rolloutPercentage: 0,
      overrides: [],
    });
    expect(await agentHubEnabled("someone")).toBe(false);
    flag(false);
    expect(await agentHubEnabled("someone")).toBe(false);
  });

  it("opens only for the account with the override", async () => {
    flag(true);
    expect(await agentHubEnabled("owner-1")).toBe(true);
  });
});
