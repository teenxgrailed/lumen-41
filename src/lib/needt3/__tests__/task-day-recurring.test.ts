/** A repeating series row sits on its next occurrence, never on a stale block. */
import { isOnToday, taskDay } from "@/lib/needt3/task-day";

describe("a repeating series row sits on its next occurrence", () => {
  it("a leftover block today does not pull a future occurrence into Today", () => {
    const row = {
      dueDate: "2026-11-22",
      scheduledStart: "2026-10-29T14:00",
      repeat: "FREQ=WEEKLY;BYDAY=SU",
    };
    expect(taskDay(row, "2026-10-29")).toBe("2026-11-22");
    expect(isOnToday(row, "2026-10-29")).toBe(false);
  });

  it("a plain task scheduled today still belongs to Today", () => {
    const row = {
      dueDate: "2026-11-22",
      scheduledStart: "2026-10-29T14:00",
      repeat: null,
    };
    expect(isOnToday(row, "2026-10-29")).toBe(true);
  });
});
