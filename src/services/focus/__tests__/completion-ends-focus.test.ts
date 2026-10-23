/**
 * A task marked done ends the focus session running on it, the same way for
 * every path: minutes booked, the rest of the block released, every open
 * client told. A full-time task keeps its session; breaks are not touched.
 */
import { endFocusForCompletedTask } from "../completion-ends-focus";

const findFirst = jest.fn();
const blockDelete = jest.fn();
const blockUpdate = jest.fn();
const finalize = jest.fn();
const publish = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    focusSession: { findFirst: (...a: unknown[]) => findFirst(...a) },
    scheduledBlock: {
      deleteMany: (...a: unknown[]) => blockDelete(...a),
      updateMany: (...a: unknown[]) => blockUpdate(...a),
    },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: (...a: unknown[]) => publish(...a),
}));
jest.mock("../focusSession", () => ({
  finalizeSession: (...a: unknown[]) => finalize(...a),
}));

const session = { id: "s1", taskId: "t1", plannedMinutes: 25 };

beforeEach(() => {
  jest.clearAllMocks();
  findFirst.mockResolvedValue(session);
  finalize.mockResolvedValue({ id: "s1", elapsedMinutes: 13 });
  publish.mockResolvedValue(undefined);
});

describe("a task done during its focus", () => {
  it("ends the session as completed, gives back the minutes and tells the clients", async () => {
    const out = await endFocusForCompletedTask({
      userId: "u1",
      task: { id: "t1", title: "Report" },
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "u1",
          taskId: "t1",
          endedAt: null,
          phase: "FOCUS",
        }),
      })
    );
    expect(finalize).toHaveBeenCalledWith({
      userId: "u1",
      sessionId: "s1",
      completed: true,
    });
    expect(out).toEqual({
      ended: true,
      sessionId: "s1",
      focusedMinutes: 13,
      earlyMinutes: 12,
    });
    // later blocks go, a block in progress stops now
    expect(blockDelete).toHaveBeenCalledWith({
      where: { taskId: "t1", start: { gte: expect.any(Date) } },
    });
    expect(blockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { end: expect.any(Date) } })
    );
    // the clients draw the toast (with Undo) and the green slice from this
    expect(publish).toHaveBeenCalledWith("u1", "focus-ended", {
      sessionId: "s1",
      status: "early",
      message: "Done 12 min early",
      minutes: 12,
      taskId: "t1",
      taskTitle: "Report",
    });
  });

  it("a clock that already ran out gives nothing back and shows no notice", async () => {
    finalize.mockResolvedValue({ id: "s1", elapsedMinutes: 25 });
    const out = await endFocusForCompletedTask({
      userId: "u1",
      task: { id: "t1" },
    });
    expect(out).toMatchObject({ ended: true, earlyMinutes: 0 });
    expect(publish).toHaveBeenCalledWith(
      "u1",
      "focus-ended",
      expect.objectContaining({ status: "done", message: undefined })
    );
  });

  it("leaves a full-time task's session running", async () => {
    for (const task of [
      { id: "t1", fullTime: true },
      { id: "t1", habitId: "h1" },
      { id: "t1", isRecurring: true },
    ]) {
      jest.clearAllMocks();
      findFirst.mockResolvedValue(session);
      const out = await endFocusForCompletedTask({ userId: "u1", task });
      expect(out).toEqual({ ended: false, reason: "full-time" });
      expect(finalize).not.toHaveBeenCalled();
      expect(publish).not.toHaveBeenCalled();
      expect(blockDelete).not.toHaveBeenCalled();
    }
  });

  it("a stored fullTime false does not end a habit's or a repeating task (they are forced on)", async () => {
    for (const task of [
      { id: "t1", habitId: "h1", fullTime: false },
      { id: "t1", isRecurring: true, fullTime: false },
    ]) {
      const out = await endFocusForCompletedTask({ userId: "u1", task });
      expect(out).toEqual({ ended: false, reason: "full-time" });
    }
    expect(finalize).not.toHaveBeenCalled();
  });

  it("an explicit fullTime false on a one-off ends it", async () => {
    const out = await endFocusForCompletedTask({
      userId: "u1",
      task: { id: "t1", fullTime: false },
    });
    expect(out.ended).toBe(true);
  });

  it("does nothing when no session runs on the task (a break has no task)", async () => {
    findFirst.mockResolvedValue(null);
    const out = await endFocusForCompletedTask({
      userId: "u1",
      task: { id: "t1" },
    });
    expect(out).toEqual({ ended: false, reason: "none" });
    expect(finalize).not.toHaveBeenCalled();
  });

  it("never throws: the task is already saved", async () => {
    finalize.mockRejectedValue(new Error("db down"));
    await expect(
      endFocusForCompletedTask({ userId: "u1", task: { id: "t1" } })
    ).resolves.toEqual({ ended: false, reason: "none" });
  });

  it("a Redis outage does not undo the end", async () => {
    publish.mockRejectedValue(new Error("redis"));
    const out = await endFocusForCompletedTask({
      userId: "u1",
      task: { id: "t1" },
    });
    expect(out.ended).toBe(true);
  });
});
