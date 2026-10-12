import { dropPatch } from "../drop";

const today = "2026-09-01";
const base = {
  dueDate: "2026-09-01",
  scheduledStart: "2026-09-01T09:00",
  scheduledEnd: "2026-09-01T09:30",
  estimatedMinutes: 30,
  projectId: null,
  isFixed: false,
  noSlot: false,
};

describe("dropPatch", () => {
  it("places a task at a timeline slot and fixes it there", () => {
    const r = dropPatch(
      { ...base, estimatedMinutes: 45 },
      { kind: "timeline", date: "2026-09-03", time: 10.25 },
      today
    );
    expect(r).toEqual({
      patch: {
        dueDate: "2026-09-03",
        scheduledStart: "2026-09-03T10:15",
        scheduledEnd: "2026-09-03T11:00",
        isFixed: true,
        noSlot: false,
      },
      message: "Placed at 10:15 · 3 Sep",
    });
  });

  it("does nothing when the slot is where the task already is", () => {
    expect(
      dropPatch(base, { kind: "timeline", date: "2026-09-01", time: 9 }, today)
    ).toBeNull();
  });

  it("clamps the time into the day and refuses a bad date", () => {
    const r = dropPatch(
      base,
      { kind: "timeline", date: "2026-09-02", time: 25 },
      today
    );
    expect(r?.patch.scheduledStart).toBe("2026-09-02T23:45");
    expect(
      dropPatch(base, { kind: "timeline", date: "3 Sep", time: 9 }, today)
    ).toBeNull();
  });

  it("moves a timed task to another day and keeps its time", () => {
    const r = dropPatch(base, { kind: "day", date: "2026-09-04" }, today);
    expect(r).toEqual({
      patch: {
        dueDate: "2026-09-04",
        scheduledStart: "2026-09-04T09:00",
        scheduledEnd: "2026-09-04T09:30",
        isFixed: true,
      },
      message: "Moved to 4 Sep · 09:00",
    });
  });

  it("moves an untimed task's due day only", () => {
    const r = dropPatch(
      { ...base, scheduledStart: null, scheduledEnd: null },
      { kind: "day", date: "2026-09-04" },
      today
    );
    expect(r).toEqual({
      patch: { dueDate: "2026-09-04" },
      message: "Moved to 4 Sep",
    });
    expect(
      dropPatch(base, { kind: "day", date: "2026-09-01" }, today)
    ).toBeNull();
  });

  it("moves a task into a project", () => {
    expect(
      dropPatch(base, { kind: "project", id: "p1", label: "Ops" }, today)
    ).toEqual({ patch: { projectId: "p1" }, message: "Moved to Ops" });
    expect(
      dropPatch(
        { ...base, projectId: "p1" },
        { kind: "project", id: "p1" },
        today
      )
    ).toBeNull();
  });

  it("leaves row and focus drops to the shell", () => {
    expect(dropPatch(base, { kind: "row", id: "x" }, today)).toBeNull();
    expect(dropPatch(base, { kind: "focus" }, today)).toBeNull();
  });
});
