import {
  doTodayPatch,
  finishHeadline,
  freeMinutesLeft,
  leftoverPatch,
  pickFinishNext,
  restLine,
  shutdownOf,
  tomorrowNote,
} from "../finish";
import { TODAY, task } from "./fixtures";

// 2026-09-01 is a Tuesday
const CAP = { start: "09:00", end: "18:00", weekends: false };

describe("freeMinutesLeft", () => {
  it("counts from now to the end of work, less events still ahead", () => {
    expect(freeMinutesLeft(CAP, TODAY, 14, [])).toBe(240);
    expect(freeMinutesLeft(CAP, TODAY, 14, [{ at: 15, len: 60 }])).toBe(180);
  });
  it("starts at the start of work when it is earlier than that", () => {
    expect(freeMinutesLeft(CAP, TODAY, 6, [])).toBe(540);
  });
  it("is 0 after work and null on a day off", () => {
    expect(freeMinutesLeft(CAP, TODAY, 19, [])).toBe(0);
    expect(freeMinutesLeft(CAP, "2026-09-05", 10, [])).toBeNull();
    expect(
      freeMinutesLeft({ ...CAP, weekends: true }, "2026-09-05", 10, [])
    ).toBe(480);
  });
});

describe("pickFinishNext", () => {
  const tomorrow = "2026-09-02";

  it("draws from overdue, tomorrow and the inbox only", () => {
    const late = task({ dueDate: "2026-08-30" });
    const tom = task({ dueDate: tomorrow });
    const inbox = task({ dueDate: null });
    const later = task({ dueDate: "2026-09-10" });
    const doneLate = task({ dueDate: "2026-08-30", done: true });
    const trashed = task({ dueDate: null, trashedAt: "2026-09-01T10:00:00Z" });
    const noSlot = task({ dueDate: null, noSlot: true });
    const today = task();
    const picks = pickFinishNext(
      [later, doneLate, trashed, noSlot, today, inbox, tom, late],
      TODAY,
      120
    );
    expect(picks.map((p) => p.task.id)).toEqual([late.id, tom.id, inbox.id]);
    expect(picks.map((p) => p.from)).toEqual(["overdue", "tomorrow", "inbox"]);
  });

  it("ranks by due day, then priority, then fit", () => {
    const older = task({ dueDate: "2026-08-29", priority: "low" });
    const newer = task({ dueDate: "2026-08-31", priority: "urgent" });
    const sameDay = (p: "high" | "low", est: number | null) =>
      task({ dueDate: tomorrow, priority: p, estimatedMinutes: est });
    const high = sameDay("high", 200);
    const lowFits = sameDay("low", 45);
    const lowBig = sameDay("low", 300);
    const lowNone = sameDay("low", null);
    const picks = pickFinishNext(
      [lowBig, lowNone, lowFits, high, newer, older],
      TODAY,
      60,
      6
    );
    expect(picks.map((p) => p.task.id)).toEqual([
      older.id,
      newer.id,
      high.id,
      lowFits.id,
      lowNone.id,
      lowBig.id,
    ]);
    expect(picks[3]?.fits).toBe(true);
    expect(picks[5]?.fits).toBe(false);
  });

  it("puts no-due-date inbox tasks after dated ones, and caps at three", () => {
    const list = [
      task({ dueDate: null }),
      task({ dueDate: tomorrow }),
      task({ dueDate: "2026-08-30" }),
      task({ dueDate: null }),
    ];
    const picks = pickFinishNext(list, TODAY, null);
    expect(picks).toHaveLength(3);
    expect(picks[0]?.task.dueDate).toBe("2026-08-30");
    expect(picks[2]?.from).toBe("inbox");
  });

  it("says why each one is offered", () => {
    const [p] = pickFinishNext(
      [task({ dueDate: "2026-08-30", estimatedMinutes: 25 })],
      TODAY,
      60
    );
    expect(p?.meta).toBe("Overdue since 30 Aug · 25 min");
  });

  it("offers nothing when there is nothing", () => {
    expect(pickFinishNext([task()], TODAY, 60)).toEqual([]);
  });
});

describe("patches", () => {
  it("Do today moves the task onto today", () => {
    expect(doTodayPatch(task({ dueDate: "2026-08-30" }), TODAY)).toEqual({
      dueDate: TODAY,
    });
  });

  it("leftovers go to tomorrow, a date or the inbox", () => {
    const t = task({ dueDate: "2026-08-30" });
    expect(leftoverPatch(t, "tomorrow", TODAY)).toEqual({
      dueDate: "2026-09-02",
    });
    expect(leftoverPatch(t, "date", TODAY, "2026-09-09")).toEqual({
      dueDate: "2026-09-09",
    });
    expect(leftoverPatch(t, "date", TODAY, null)).toEqual({
      dueDate: "2026-09-02",
    });
    expect(leftoverPatch(t, "inbox", TODAY)).toEqual({
      dueDate: null,
      scheduledStart: null,
      scheduledEnd: null,
    });
  });
});

describe("shutdownOf", () => {
  it("lists what was done and what is left, once each", () => {
    const done = task({ done: true });
    const open = task();
    const late = task({ dueDate: "2026-08-30" });
    const s = shutdownOf([late], [done, open]);
    expect(s.done.map((t) => t.id)).toEqual([done.id]);
    expect(s.leftovers.map((t) => t.id)).toEqual([open.id, late.id]);
    expect(shutdownOf([open], [open]).leftovers).toHaveLength(1);
  });
});

describe("the finished-day words", () => {
  it("says All done only when nothing listed is open", () => {
    expect(finishHeadline({ late: 0, inbox: 0 }).title).toBe(
      "All done for today"
    );
    expect(finishHeadline({ late: 1, inbox: 0 }).title).not.toMatch(
      /all done/i
    );
    expect(finishHeadline({ late: 0, inbox: 2 }).title).not.toMatch(
      /all done/i
    );
  });
  it("names what is still open", () => {
    expect(restLine({ late: 0, inbox: 0 })).toBe("");
    expect(restLine({ late: 2, inbox: 3 })).toBe(
      "2 overdue · 3 in Inbox still open"
    );
  });
  it("turns the note into a section, and nothing into nothing", () => {
    expect(tomorrowNote("  call Anna ")).toBe("## From yesterday\n\ncall Anna");
    expect(tomorrowNote("   ")).toBe("");
  });
});
