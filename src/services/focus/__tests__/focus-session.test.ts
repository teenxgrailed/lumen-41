/**
 * Ending a focus session early: a NORMAL session ends at once (no two-press
 * wait), a strict one keeps its rules, a clock that ran out is booked at its
 * planned length, and early-ended minutes count toward the day.
 */
import {
  FocusExitError,
  exitDelaySeconds,
  finalizeSession,
} from "../focusSession";
import { isFocusMinutes, keepsStreak } from "../focusStats";

const findFirst = jest.fn();
const update = jest.fn();
const timeEntryCreate = jest.fn();
const taskUpdate = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    focusSession: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      update: (...a: unknown[]) => update(...a),
    },
    timeEntry: { create: (...a: unknown[]) => timeEntryCreate(...a) },
    task: { update: (...a: unknown[]) => taskUpdate(...a) },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/services/time-tracking/timeEntries", () => ({
  recomputeTaskActuals: jest.fn(),
}));
jest.mock("../focusStats", () => ({
  ...jest.requireActual("../focusStats"),
  recomputeFocusStats: jest.fn(),
}));

const NOW = new Date("2026-10-14T10:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

const row = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  userId: "u1",
  taskId: "t1",
  phase: "FOCUS",
  strictness: "NORMAL",
  plannedMinutes: 25,
  startedAt: minutesAgo(8),
  pausedAt: null,
  pausedTotalSeconds: 0,
  stopRequestedAt: null,
  exitAttemptCount: 0,
  ...over,
});

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  jest.clearAllMocks();
  update.mockImplementation(async ({ data }) => ({ ...row(), ...data }));
});
afterEach(() => jest.useRealTimers());

describe("exitDelaySeconds", () => {
  it("never makes a NORMAL session wait", () => {
    expect([0, 1, 2, 9].map((n) => exitDelaySeconds("NORMAL", n))).toEqual([
      0, 0, 0, 0,
    ]);
  });
  it("keeps the growing wait of a strict session", () => {
    expect([0, 1, 2, 9].map((n) => exitDelaySeconds("TIMEOUT", n))).toEqual([
      5, 10, 20, 20,
    ]);
  });
});

describe("finalizeSession, ending early", () => {
  it("ends a NORMAL session in one call, with the minutes actually focused", async () => {
    findFirst.mockResolvedValue(row());
    await finalizeSession({
      userId: "u1",
      sessionId: "s1",
      completed: false,
    });
    const data = update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      completed: false,
      abandoned: true,
      elapsedMinutes: 8,
    });
  });

  it("books the minutes on the task even though the clock did not run out", async () => {
    findFirst.mockResolvedValue(row());
    await finalizeSession({ userId: "u1", sessionId: "s1", completed: false });
    expect(timeEntryCreate).toHaveBeenCalledTimes(1);
    expect(taskUpdate).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { actualFocusedMinutes: { increment: 8 } },
    });
  });

  it("books nothing for a break", async () => {
    findFirst.mockResolvedValue(row({ phase: "SHORT_BREAK", taskId: null }));
    await finalizeSession({ userId: "u1", sessionId: "s1", completed: true });
    expect(timeEntryCreate).not.toHaveBeenCalled();
  });

  it("subtracts a pause in progress", async () => {
    findFirst.mockResolvedValue(
      row({ pausedAt: minutesAgo(3), startedAt: minutesAgo(8) })
    );
    await finalizeSession({ userId: "u1", sessionId: "s1", completed: false });
    expect(update.mock.calls[0][0].data.elapsedMinutes).toBe(5);
  });

  it("makes a TIMEOUT session ask first, then wait", async () => {
    findFirst.mockResolvedValue(row({ strictness: "TIMEOUT" }));
    await expect(
      finalizeSession({ userId: "u1", sessionId: "s1", completed: false })
    ).rejects.toMatchObject({ code: "EXIT_DELAY_REQUIRED" });
    findFirst.mockResolvedValue(
      row({
        strictness: "TIMEOUT",
        stopRequestedAt: new Date(NOW.getTime() - 1000),
        exitAttemptCount: 1,
      })
    );
    await expect(
      finalizeSession({ userId: "u1", sessionId: "s1", completed: false })
    ).rejects.toMatchObject({ code: "EXIT_DELAY_ACTIVE" });
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps DEEP_FOCUS locked", async () => {
    findFirst.mockResolvedValue(row({ strictness: "DEEP_FOCUS" }));
    await expect(
      finalizeSession({ userId: "u1", sessionId: "s1", completed: false })
    ).rejects.toBeInstanceOf(FocusExitError);
  });
});

describe("finalizeSession, the clock ran out", () => {
  it("books the planned length when the session is found hours later", async () => {
    findFirst.mockResolvedValue(row({ startedAt: minutesAgo(600) }));
    await finalizeSession({ userId: "u1", sessionId: "s1", completed: true });
    const data = update.mock.calls[0][0].data;
    expect(data.elapsedMinutes).toBe(25);
    expect(data.endedAt.getTime()).toBe(minutesAgo(600 - 25).getTime());
  });

  it("counts earlier pauses in the planned end", async () => {
    findFirst.mockResolvedValue(
      row({ startedAt: minutesAgo(600), pausedTotalSeconds: 600 })
    );
    await finalizeSession({ userId: "u1", sessionId: "s1", completed: true });
    expect(update.mock.calls[0][0].data.elapsedMinutes).toBe(25);
  });
});

describe("what counts toward the day", () => {
  const s = (over: Record<string, unknown>) => ({
    phase: "FOCUS" as const,
    endedAt: NOW,
    elapsedMinutes: 12,
    completed: false,
    ...over,
  });
  it("counts an early-ended focus session", () => {
    expect(isFocusMinutes(s({}))).toBe(true);
  });
  it("skips breaks, running sessions and empty ones", () => {
    expect(isFocusMinutes(s({ phase: "SHORT_BREAK" }))).toBe(false);
    expect(isFocusMinutes(s({ endedAt: null }))).toBe(false);
    expect(isFocusMinutes(s({ elapsedMinutes: 0 }))).toBe(false);
  });
  it("keeps a streak for a finished session or five minutes", () => {
    expect(keepsStreak(s({ elapsedMinutes: 2, completed: true }))).toBe(true);
    expect(keepsStreak(s({ elapsedMinutes: 5 }))).toBe(true);
    expect(keepsStreak(s({ elapsedMinutes: 2 }))).toBe(false);
  });
});
