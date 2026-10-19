import { getRedisConnection } from "@/lib/queue/connection";

import { publishRealtimeEvent, publishRealtimeEventSafe } from "../publish";

jest.mock("@/lib/logger", () => ({
  logger: { debug: jest.fn(), warn: jest.fn() },
}));
jest.mock("@/lib/queue/connection", () => ({ getRedisConnection: jest.fn() }));

const publishMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  process.env.REDIS_URL = "redis://localhost:6379";
  (getRedisConnection as jest.Mock).mockReturnValue({ publish: publishMock });
});

describe("publishRealtimeEventSafe", () => {
  it("publishes the event on the person's channel", async () => {
    await publishRealtimeEventSafe("u1", "tasks-updated");
    expect(publishMock).toHaveBeenCalledWith(
      "needt:realtime:user:u1",
      expect.stringContaining('"type":"tasks-updated"')
    );
  });

  it("swallows a Redis failure so a saved write is not reported as failed", async () => {
    publishMock.mockRejectedValueOnce(new Error("redis down"));
    await expect(
      publishRealtimeEventSafe("u1", "tasks-updated")
    ).resolves.toBeUndefined();
    publishMock.mockRejectedValueOnce(new Error("redis down"));
    await expect(publishRealtimeEvent("u1", "tasks-updated")).rejects.toThrow(
      "redis down"
    );
  });
});
