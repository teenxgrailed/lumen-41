import {
  ScheduleSnapshot,
  diffScheduleSnapshots,
  replanActivationEvent,
} from "../reschedule-preview";

describe("replanActivationEvent", () => {
  it("counts the chat card as replan shown, Keep and Undo", () => {
    expect(replanActivationEvent("preview")).toBe("replan_shown");
    expect(replanActivationEvent("apply", "chat")).toBe("keep_applied");
    expect(replanActivationEvent("undo", "chat")).toBe("undo_applied");
  });

  it("never counts Fill it as a replan or Keep", () => {
    expect(replanActivationEvent("preview", "fill")).toBeNull();
    expect(replanActivationEvent("apply", "fill")).toBe("fill_applied");
    expect(replanActivationEvent("undo", "fill")).toBeNull();
  });
});

describe("reschedule preview staging", () => {
  it("returns only changed placements", () => {
    const before: ScheduleSnapshot = {
      tasks: [
        {
          id: "task",
          title: "Write",
          scheduledStart: null,
          scheduledEnd: null,
          scheduleScore: null,
          lastScheduled: null,
          isAutoScheduled: true,
          autoScheduled: true,
          updatedAt: "2026-07-18T08:00:00.000Z",
        },
      ],
      blocks: [],
    };
    const after: ScheduleSnapshot = {
      ...before,
      tasks: [
        {
          ...before.tasks[0],
          scheduledStart: "2026-07-18T09:00:00.000Z",
          scheduledEnd: "2026-07-18T10:00:00.000Z",
        },
      ],
    };
    expect(diffScheduleSnapshots(before, after)).toHaveLength(1);
    expect(diffScheduleSnapshots(before, after)[0]).toEqual(
      expect.objectContaining({
        explanation: "Placed in deterministic available working time.",
      })
    );
  });
});
