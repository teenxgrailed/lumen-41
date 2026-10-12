import {
  feedBatchUpdateSchema,
  feedCreateSchema,
  feedUpdateSchema,
} from "@/lib/calendar-feed-input";

describe("what a person may set on a calendar", () => {
  it("drops ownership, account and sync fields when creating", () => {
    const parsed = feedCreateSchema.parse({
      name: "Needt",
      type: "LOCAL",
      enabled: true,
      userId: "someone-else",
      accountId: "their-account",
      syncToken: "t",
      channelId: "c",
    });
    expect(parsed).toEqual({ name: "Needt", type: "LOCAL", enabled: true });
  });

  it("refuses a calendar without a name", () => {
    expect(feedCreateSchema.safeParse({ type: "LOCAL" }).success).toBe(false);
  });

  it("keeps only name, colour, enabled and error on update", () => {
    expect(
      feedUpdateSchema.parse({
        enabled: false,
        error: "Sync failed",
        accountId: "their-account",
        userId: "someone-else",
      })
    ).toEqual({ enabled: false, error: "Sync failed" });
  });

  it("keeps only id, enabled and colour in a batch", () => {
    expect(
      feedBatchUpdateSchema.parse({
        feeds: [{ id: "f", enabled: true, accountId: "x", userId: "y" }],
      })
    ).toEqual({ feeds: [{ id: "f", enabled: true }] });
  });
});
