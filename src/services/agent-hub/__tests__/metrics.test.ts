import { sendUmamiEvent } from "@/lib/umami-server";

import { trackHub } from "../metrics";

jest.mock("@/lib/umami-server", () => ({
  sendUmamiEvent: jest.fn().mockResolvedValue(undefined),
}));

describe("trackHub", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.UMAMI_HUB_WEBSITE_ID = "hub-site";
  });
  afterEach(() => {
    delete process.env.UMAMI_HUB_WEBSITE_ID;
  });

  it("sends the event name apart from its data: ids, kinds, outcomes only", () => {
    trackHub({ name: "hub_item_completed", itemId: "i1", outcome: "failed" });
    expect(sendUmamiEvent).toHaveBeenCalledWith(
      "hub_item_completed",
      { itemId: "i1", outcome: "failed" },
      { website: "hub-site" }
    );
    trackHub({ name: "agent_registered", agentId: "a1", kind: "claude" });
    expect(sendUmamiEvent).toHaveBeenLastCalledWith(
      "agent_registered",
      { agentId: "a1", kind: "claude" },
      { website: "hub-site" }
    );
  });

  it("never falls back to the landing site when no hub site is set", () => {
    delete process.env.UMAMI_HUB_WEBSITE_ID;
    trackHub({ name: "escalation_answered", itemId: "i2" });
    expect(sendUmamiEvent).toHaveBeenCalledWith(
      "escalation_answered",
      { itemId: "i2" },
      { website: undefined }
    );
  });
});
