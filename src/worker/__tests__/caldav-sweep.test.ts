import {
  CALDAV_STALE_AFTER_MS,
  CALDAV_SWEEP_BATCH,
  sweepCalDavFeeds,
} from "@/worker/caldav-sweep";

import { listCalDavFeedIdsForSweep } from "@/lib/calendar-db";
import { enqueueCalendarSync } from "@/lib/queue/enqueue";

jest.mock("@/lib/calendar-db", () => ({
  listCalDavFeedIdsForSweep: jest.fn(),
}));
jest.mock("@/lib/queue/enqueue", () => ({ enqueueCalendarSync: jest.fn() }));

describe("CalDAV sweep", () => {
  it("asks for a bounded batch of feeds not synced recently, and queues them", async () => {
    (listCalDavFeedIdsForSweep as jest.Mock).mockResolvedValue(["c1", "c2"]);
    expect(await sweepCalDavFeeds()).toBe(2);
    expect(listCalDavFeedIdsForSweep).toHaveBeenCalledWith(
      CALDAV_STALE_AFTER_MS,
      CALDAV_SWEEP_BATCH
    );
    expect(enqueueCalendarSync).toHaveBeenCalledWith("c1");
    expect(enqueueCalendarSync).toHaveBeenCalledWith("c2");
  });
});
