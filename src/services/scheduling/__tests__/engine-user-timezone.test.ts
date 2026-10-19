// Production runs in Docker with no TZ, so the process clock is UTC. Hours and
// days must come from the person's zone, never from the process.
import { formatInTimeZone } from "date-fns-tz";
import { spawnSync } from "node:child_process";

import { workingWindowsForRange } from "../capacity";
import {
  CalendarBusyBlock,
  SchedulableTask,
  SchedulingPreferences,
  scheduleTasks,
} from "../engine";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/work-week-server", () => ({ loadWeekHours: jest.fn() }));
jest.mock("@/services/personal-time/service", () => ({
  personalBusyBlocks: jest.fn(),
}));
jest.mock("@/lib/auth/workspace-auth", () => ({
  workspaceDataScopeWhere: jest.fn(),
}));

const weekdays = (start: string, end: string) =>
  Object.fromEntries([1, 2, 3, 4, 5].map((d) => [String(d), { start, end }]));

function prefsFor(
  timeZone: string,
  overrides: Partial<SchedulingPreferences> = {}
): SchedulingPreferences {
  return {
    workHours: weekdays("09:00", "17:00"),
    bufferMinutes: 0,
    maxDeepWorkPerDay: 600,
    minBreakMinutes: 0,
    autoRescheduleOnMiss: true,
    enableBodyDoubling: false,
    enableTaskBatching: false,
    hardStopTime: "17:00",
    bufferMultiplier: 1,
    timeZone,
    ...overrides,
  };
}

function task(overrides: Partial<SchedulableTask> = {}): SchedulableTask {
  return {
    id: "task",
    title: "Task",
    assigneeId: "user-1",
    status: "todo",
    createdAt: new Date("2026-01-01T08:00:00.000Z"),
    estimatedMinutes: 60,
    priority: "MEDIUM",
    energyRequired: "MEDIUM",
    ...overrides,
  };
}

function run(
  zone: string,
  now: string,
  tasks: SchedulableTask[],
  prefs: SchedulingPreferences,
  busyBlocks: CalendarBusyBlock[] = []
) {
  return scheduleTasks({
    tasks,
    busyBlocks,
    energyProfile: { windows: [] },
    prefs,
    now: new Date(now),
  }).blocks.map((block) => ({
    id: block.taskId,
    start: formatInTimeZone(block.start, zone, "yyyy-MM-dd HH:mm"),
    end: formatInTimeZone(block.end, zone, "yyyy-MM-dd HH:mm"),
  }));
}

/**
 * Jest gives each test file a copy of process.env, so setting TZ here does not
 * move the real clock. When the machine is not already on UTC (CI is), this
 * file runs itself again in a child jest with TZ=UTC and requires it to pass.
 */
const processIsUtc = new Date(2026, 6, 1).getTimezoneOffset() === 0;

if (!processIsUtc && !process.env.ENGINE_TZ_CHILD) {
  it("passes when the process clock is UTC (as in Docker)", () => {
    const result = spawnSync(
      process.execPath,
      [
        require.resolve("jest/bin/jest"),
        "--runTestsByPath",
        __filename,
        "--runInBand",
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, TZ: "UTC", ENGINE_TZ_CHILD: "1" },
        encoding: "utf8",
      }
    );
    if (result.status !== 0) {
      throw new Error(`${result.stdout}\n${result.stderr}`);
    }
  }, 120_000);
} else {
  defineSuite();
}

function defineSuite() {
  describe("scheduling engine uses the user's time zone", () => {
    it("runs the suite with a UTC process clock", () => {
      expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(0);
    });

    it("places Zurich work at 09:00-17:00 Zurich in summer (UTC+2)", () => {
      // Mon 19 Oct 2026, 07:00 Zurich
      const blocks = run(
        "Europe/Zurich",
        "2026-10-19T05:00:00Z",
        [task({ estimatedMinutes: 480 })],
        prefsFor("Europe/Zurich", { minBreakMinutes: 0 })
      );
      expect(blocks[0].start).toBe("2026-10-19 09:00");
      expect(blocks.at(-1)!.end).toBe("2026-10-19 17:00");
    });

    it("places Zurich work at 09:00 Zurich in winter (UTC+1)", () => {
      const blocks = run(
        "Europe/Zurich",
        "2026-12-07T05:00:00Z",
        [task()],
        prefsFor("Europe/Zurich")
      );
      expect(blocks[0].start).toBe("2026-12-07 09:00");
    });

    it("places New York work at 09:00 New York", () => {
      // Mon 19 Oct 2026, 07:00 New York (EDT, UTC-4)
      const blocks = run(
        "America/New_York",
        "2026-10-19T11:00:00Z",
        [task()],
        prefsFor("America/New_York")
      );
      expect(blocks[0].start).toBe("2026-10-19 09:00");
    });

    it("does not place work after the Zurich day ends (hard stop 17:00 Zurich)", () => {
      // Mon 19 Oct, 16:30 Zurich: an hour does not fit, so it goes to Tuesday.
      const blocks = run(
        "Europe/Zurich",
        "2026-10-19T14:30:00Z",
        [task()],
        prefsFor("Europe/Zurich")
      );
      expect(blocks[0].start).toBe("2026-10-20 09:00");
    });

    it("reads the weekday in the user's zone, not the process's", () => {
      // Fri 23 Oct 2026, 20:00 New York is already Saturday in UTC.
      const blocks = run(
        "America/New_York",
        "2026-10-24T00:00:00Z",
        [task()],
        prefsFor("America/New_York")
      );
      expect(blocks[0].start).toBe("2026-10-26 09:00");
    });

    it("uses per-day hours in the user's zone", () => {
      const prefs = prefsFor("Europe/Zurich", {
        workHours: {
          ...weekdays("09:00", "17:00"),
          "2": { start: "13:00", end: "17:00" },
        },
      });
      const blocks = run(
        "Europe/Zurich",
        "2026-10-19T14:30:00Z",
        [task()],
        prefs
      );
      expect(blocks[0].start).toBe("2026-10-20 13:00");
    });

    it("keeps a blocked hour (personal time / calendar) in the user's zone", () => {
      // Zurich 09:00-10:00 is busy; the task goes to 10:00 Zurich.
      const blocks = run(
        "Europe/Zurich",
        "2026-10-19T05:00:00Z",
        [task()],
        prefsFor("Europe/Zurich"),
        [
          {
            id: "lunch",
            title: "Busy",
            start: new Date("2026-10-19T07:00:00Z"),
            end: new Date("2026-10-19T08:00:00Z"),
            source: "calendar",
          },
        ]
      );
      expect(blocks[0].start).toBe("2026-10-19 10:00");
    });

    it("applies a flexible-hours override to the user's calendar day", () => {
      // Mon 19 Oct: start later at 12:00 Zurich.
      const blocks = run(
        "Europe/Zurich",
        "2026-10-19T05:00:00Z",
        [task()],
        prefsFor("Europe/Zurich", {
          flexibleHoursOverrides: [
            { date: "2026-10-19", kind: "START_LATER", startTime: "12:00" },
          ],
        })
      );
      expect(blocks[0].start).toBe("2026-10-19 12:00");
    });

    it("steps through the Zurich clock-change day without hanging", () => {
      // Sat 24 Oct 2026 18:00 Zurich; 25 Oct is a 25-hour Sunday (off), then Monday.
      const blocks = run(
        "Europe/Zurich",
        "2026-10-24T16:00:00Z",
        [task()],
        prefsFor("Europe/Zurich")
      );
      expect(blocks[0].start).toBe("2026-10-26 09:00");
    });

    it("capacity: working windows are the user's hours, not the process's", () => {
      const week = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        day,
        on: day >= 1 && day <= 5,
        ranges: [{ start: "09:00", end: "17:00" }],
      }));
      // Fri 23 Oct 2026 00:00 New York, three days: Fri, Sat (off), Sun (off).
      const start = new Date("2026-10-23T04:00:00Z");
      const windows = workingWindowsForRange(
        week,
        start,
        3,
        "America/New_York"
      );
      expect(windows).toHaveLength(1);
      expect(windows[0].start.toISOString()).toBe("2026-10-23T13:00:00.000Z");
      expect(windows[0].end.toISOString()).toBe("2026-10-23T21:00:00.000Z");
    });
  });
}
