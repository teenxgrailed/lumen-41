import { sendUmamiEvent } from "@/lib/umami-server";

import { trackHub } from "../metrics";

jest.mock("@/lib/umami-server", () => ({
  sendUmamiEvent: jest.fn().mockResolvedValue(undefined),
}));

describe("trackHub", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends the event name apart from its data: ids, kinds, outcomes only", () => {
    trackHub({ name: "hub_item_completed", itemId: "i1", outcome: "failed" });
    expect(sendUmamiEvent).toHaveBeenCalledWith("hub_item_completed", {
      itemId: "i1",
      outcome: "failed",
    });
    trackHub({ name: "agent_registered", agentId: "a1", kind: "claude" });
    expect(sendUmamiEvent).toHaveBeenLastCalledWith("agent_registered", {
      agentId: "a1",
      kind: "claude",
    });
  });
});
