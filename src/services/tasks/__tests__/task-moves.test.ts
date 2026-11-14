import { isMoveLater } from "@/services/tasks/task-moves";

describe("plan 11 T-2: isMoveLater", () => {
  const d = (s: string) => new Date(s);

  it("counts a due date moved later", () => {
    expect(
      isMoveLater(
        { dueDate: d("2026-11-10T00:00:00Z") },
        { dueDate: d("2026-11-12T00:00:00Z") }
      )
    ).toBe(true);
  });

  it("does not count a due date moved earlier, set for the first time, or cleared", () => {
    const before = { dueDate: d("2026-11-10T00:00:00Z") };
    expect(isMoveLater(before, { dueDate: d("2026-11-09T00:00:00Z") })).toBe(
      false
    );
    expect(isMoveLater({ dueDate: null }, { dueDate: d("2026-11-12") })).toBe(
      false
    );
    expect(isMoveLater(before, { dueDate: null })).toBe(false);
  });

  it("counts a placement moved to another day, not a time change within one", () => {
    const tz = "Europe/Zurich";
    const morning = { scheduledStart: d("2026-11-10T07:00:00Z") };
    expect(
      isMoveLater(morning, { scheduledStart: d("2026-11-10T20:00:00Z") }, tz)
    ).toBe(false);
    // 23:30 → 08:00 the next day, local: a move though only 8.5 h later.
    const late = { scheduledStart: d("2026-11-10T22:30:00Z") };
    expect(
      isMoveLater(late, { scheduledStart: d("2026-11-11T07:00:00Z") }, tz)
    ).toBe(true);
  });

  it("does not count a due time changed within the same day", () => {
    expect(
      isMoveLater(
        { dueDate: d("2026-11-10T08:00:00Z") },
        { dueDate: d("2026-11-10T16:00:00Z") },
        "Europe/Zurich"
      )
    ).toBe(false);
  });

  it("counts a postpone into the future", () => {
    expect(
      isMoveLater({ postponedUntil: null }, { postponedUntil: d("2999-01-01") })
    ).toBe(true);
    expect(
      isMoveLater({ postponedUntil: null }, { postponedUntil: d("2000-01-01") })
    ).toBe(false);
  });

  it("never counts a completion", () => {
    expect(
      isMoveLater(
        { dueDate: d("2026-11-10") },
        { dueDate: d("2026-11-17"), status: "completed" }
      )
    ).toBe(false);
  });
});
