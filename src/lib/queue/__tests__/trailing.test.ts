import { DelayedError } from "bullmq";

import { deferTrailingJob } from "@/lib/queue/trailing";

function job(id: string) {
  return { id, moveToDelayed: jest.fn().mockResolvedValue(undefined) };
}
const queueWith = (active: boolean | null) => ({
  getJob: jest
    .fn()
    .mockResolvedValue(
      active === null ? null : { isActive: jest.fn().mockResolvedValue(active) }
    ),
});

describe("deferTrailingJob", () => {
  it("pushes a trailing job back while its primary is active", async () => {
    const j = job("calendar-sync-f1-next");
    const queue = queueWith(true);
    await expect(deferTrailingJob(j, "tok", queue)).rejects.toBeInstanceOf(
      DelayedError
    );
    expect(queue.getJob).toHaveBeenCalledWith("calendar-sync-f1");
    expect(j.moveToDelayed).toHaveBeenCalledWith(expect.any(Number), "tok");
  });

  it("lets it run once the primary is no longer active", async () => {
    const j = job("reschedule-u1-next");
    await deferTrailingJob(j, "tok", queueWith(false));
    expect(j.moveToDelayed).not.toHaveBeenCalled();
  });

  it("lets it run when the primary is gone", async () => {
    const j = job("reschedule-u1-next");
    await deferTrailingJob(j, "tok", queueWith(null));
    expect(j.moveToDelayed).not.toHaveBeenCalled();
  });

  it("never defers a primary job", async () => {
    const j = job("calendar-sync-f1");
    const queue = queueWith(true);
    await deferTrailingJob(j, "tok", queue);
    expect(queue.getJob).not.toHaveBeenCalled();
  });
});
