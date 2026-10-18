import { AutoScheduleSettings } from "@prisma/client";

import { fromZonedTime, toZonedTime } from "@/lib/date-utils";

import { TimeSlot } from "@/types/scheduling";

import { CalendarService } from "../CalendarService";
import { TimeSlotManagerImpl } from "../TimeSlotManager";

// No personal time here: these cases are about buffers and calendar events.
jest.mock("../../personal-time/service", () => ({
  loadPersonalOccurrences: jest.fn().mockResolvedValue([]),
}));

const TIME_ZONE = "Europe/Zurich";

const settings = {
  bufferMinutes: 15,
  workDays: "[1,2,3,4,5]",
  workHourStart: 9,
  workHourEnd: 17,
  selectedCalendars: '["calendar-1"]',
} as AutoScheduleSettings;

function slot(startHour: number, endHour: number): TimeSlot {
  const atHour = (hour: number) =>
    fromZonedTime(
      `2026-08-10T${hour.toString().padStart(2, "0")}:00:00`,
      TIME_ZONE
    );

  return {
    start: atHour(startHour),
    end: atHour(endHour),
    score: 0,
    conflicts: [],
    energyLevel: null,
    isWithinWorkHours: true,
    hasBufferTime: false,
  };
}

function calendarService(conflictFor?: "before" | "after"): CalendarService {
  return {
    findConflicts: jest.fn().mockImplementation((candidate: TimeSlot) => {
      const zonedStart = toZonedTime(candidate.start, TIME_ZONE);
      const zonedEnd = toZonedTime(candidate.end, TIME_ZONE);
      if (conflictFor === "before" && zonedEnd.getHours() === 10) {
        return [
          {
            type: "calendar_event",
            start: candidate.start,
            end: candidate.end,
            title: "Existing meeting",
            source: { type: "calendar", id: "busy-1" },
          },
        ];
      }
      if (conflictFor === "after" && zonedStart.getHours() === 11) {
        return [
          {
            type: "calendar_event",
            start: candidate.start,
            end: candidate.end,
            title: "Existing meeting",
            source: { type: "calendar", id: "busy-1" },
          },
        ];
      }
      return [];
    }),
    findBatchConflicts: jest.fn(),
    getEvents: jest.fn(),
  };
}

describe("TimeSlotManager buffers", () => {
  it("rejects a slot when its pre-task buffer overlaps a calendar event", async () => {
    const manager = new TimeSlotManagerImpl(
      settings,
      calendarService("before"),
      "Europe/Zurich"
    );

    await expect(manager.isSlotAvailable(slot(10, 11), "user-1")).resolves.toBe(
      false
    );
  });

  it("rejects a slot when its post-task buffer overlaps a calendar event", async () => {
    const manager = new TimeSlotManagerImpl(
      settings,
      calendarService("after"),
      "Europe/Zurich"
    );

    await expect(manager.isSlotAvailable(slot(10, 11), "user-1")).resolves.toBe(
      false
    );
  });

  it("does not treat a slot at the workday edge as buffered", async () => {
    const manager = new TimeSlotManagerImpl(
      settings,
      calendarService(),
      "Europe/Zurich"
    );

    await expect(manager.isSlotAvailable(slot(9, 10), "user-1")).resolves.toBe(
      false
    );
  });
});
