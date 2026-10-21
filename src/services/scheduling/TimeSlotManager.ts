import { AutoScheduleSettings } from "@prisma/client";
import { Task } from "@prisma/client";

import { parseSelectedCalendars, parseWorkDays } from "@/lib/autoSchedule";
import {
  addDays,
  addMinutes,
  areIntervalsOverlapping,
  differenceInHours,
  fromZonedTime,
  getDay,
  newDate,
  roundDateUp,
  setHours,
  setMinutes,
  toZonedTime,
} from "@/lib/date-utils";
import { type PersonalOccurrence, overlapsPersonal } from "@/lib/personal-time";
import { prisma } from "@/lib/prisma";
import { activeProjectTaskWhere } from "@/lib/projects/archive";

import { useSettingsStore } from "@/store/settings";

import { Conflict, TimeSlot } from "@/types/scheduling";

import { loadPersonalOccurrences } from "../personal-time/service";
import { CalendarService } from "./CalendarService";
import { SlotScorer } from "./SlotScorer";

// Import the global Prisma instance

const DEFAULT_TASK_DURATION = 30;

export interface TimeSlotManager {
  findAvailableSlots(
    task: Task,
    startDate: Date,
    endDate: Date,
    userId: string
  ): Promise<TimeSlot[]>;

  isSlotAvailable(slot: TimeSlot, userId: string): Promise<boolean>;

  calculateBufferTimes(slot: TimeSlot): {
    beforeBuffer: TimeSlot;
    afterBuffer: TimeSlot;
  };

  updateScheduledTasks(userId: string): Promise<void>;

  addScheduledTaskConflict(task: Task): Promise<void>;
}

export class TimeSlotManagerImpl implements TimeSlotManager {
  private slotScorer: SlotScorer;
  private timeZone: string;
  /** Personal time (Lunch, Walk...) over the span asked about so far. */
  private personal: {
    userId: string;
    from: number;
    to: number;
    occurrences: PersonalOccurrence[];
  } | null = null;

  constructor(
    private settings: AutoScheduleSettings,
    private calendarService: CalendarService,
    timeZone?: string
  ) {
    // On the server the settings store holds no user state, so callers
    // should pass the user's timezone explicitly (e.g. from UserSettings).
    this.timeZone = timeZone || useSettingsStore.getState().user.timeZone;
    this.slotScorer = new SlotScorer(settings, new Map(), this.timeZone);
  }

  async updateScheduledTasks(userId: string): Promise<void> {
    // Fetch all scheduled tasks
    const scheduledTasks = await prisma.task.findMany({
      where: {
        isAutoScheduled: true,
        scheduledStart: { not: null },
        scheduledEnd: { not: null },
        isArchived: false,
        AND: [activeProjectTaskWhere],
        // Locked tasks keep their slots across runs, so they must count as
        // busy no matter what project they belong to (or none at all);
        // unlocked tasks are about to be rescheduled and must not block
        scheduleLocked: true,
        userId,
      },
    });

    // Update the slot scorer with the latest scheduled tasks
    this.slotScorer.updateScheduledTasks(scheduledTasks);
  }

  async findAvailableSlots(
    task: Task,
    startDate: Date,
    endDate: Date,
    userId: string
  ): Promise<TimeSlot[]> {
    // Only load scheduled tasks from the database on the first call
    // For subsequent calls, we'll use the in-memory scheduled tasks
    // that have been updated by addScheduledTaskConflict
    if (this.slotScorer.getScheduledTasks().size === 0) {
      await this.updateScheduledTasks(userId);
    }

    // If task has a startDate that is beyond our endDate window, return empty slots
    // These tasks will get picked up in a future scheduling run
    if (task.startDate instanceof Date && task.startDate > endDate) {
      // Skip this task - it will be scheduled in a future run
      return [];
    }

    // If task has a startDate and it's after the provided startDate but within window, use the task's startDate
    const effectiveStartDate =
      task.startDate instanceof Date && task.startDate > startDate
        ? task.startDate
        : startDate;

    // 1. Generate potential slots
    const potentialSlots = this.generatePotentialSlots(
      task.duration || DEFAULT_TASK_DURATION,
      effectiveStartDate,
      endDate
    );

    // 2. Filter by work hours
    const workHourSlots = this.filterByWorkHours(potentialSlots);

    // 3. Check calendar conflicts, then personal time: a task is never
    // placed inside Lunch, a Walk or any other block the person keeps.
    await this.loadPersonal(userId, effectiveStartDate, endDate);
    const availableSlots = (
      await this.removeConflicts(workHourSlots, task)
    ).filter((slot) => !this.inPersonalTime(slot.start, slot.end));

    // 4. Reserve both sides of a task's configured buffer. A task may not be
    // placed when either buffer overlaps a calendar event or another scheduled
    // task; otherwise a later run could consume the transition time.
    const slotsWithBuffer = await this.filterSlotsWithAvailableBuffers(
      availableSlots,
      userId
    );

    // 5. Score slots
    const scoredSlots = this.scoreSlots(slotsWithBuffer, task);

    // 6. Sort by score
    const sortedSlots = this.sortByScore(scoredSlots);

    return sortedSlots;
  }

  async isSlotAvailable(slot: TimeSlot, userId: string): Promise<boolean> {
    // Check if the slot is within work hours
    if (!this.isWithinWorkHours(slot)) {
      return false;
    }

    // Check for calendar conflicts
    const conflicts = await this.findCalendarConflicts(slot, userId);
    if (conflicts.length > 0) {
      return false;
    }

    await this.loadPersonal(userId, slot.start, slot.end);
    if (this.inPersonalTime(slot.start, slot.end)) {
      return false;
    }

    // Check for conflicts with in-memory scheduled tasks
    if (this.hasInMemoryConflict(slot)) {
      return false;
    }

    if (!(await this.hasAvailableBuffers(slot, userId))) {
      return false;
    }

    return true;
  }

  calculateBufferTimes(slot: TimeSlot): {
    beforeBuffer: TimeSlot;
    afterBuffer: TimeSlot;
  } {
    const bufferMinutes = this.settings.bufferMinutes;

    return {
      beforeBuffer: {
        start: addMinutes(slot.start, -bufferMinutes),
        end: slot.start,
        score: 0,
        conflicts: [],
        energyLevel: null,
        isWithinWorkHours: this.isWithinWorkHours({
          start: addMinutes(slot.start, -bufferMinutes),
          end: slot.start,
          score: 0,
          conflicts: [],
          energyLevel: null,
          isWithinWorkHours: false,
          hasBufferTime: false,
        }),
        hasBufferTime: false,
      },
      afterBuffer: {
        start: slot.end,
        end: addMinutes(slot.end, bufferMinutes),
        score: 0,
        conflicts: [],
        energyLevel: null,
        isWithinWorkHours: this.isWithinWorkHours({
          start: slot.end,
          end: addMinutes(slot.end, bufferMinutes),
          score: 0,
          conflicts: [],
          energyLevel: null,
          isWithinWorkHours: false,
          hasBufferTime: false,
        }),
        hasBufferTime: false,
      },
    };
  }

  /**
   * Generates potential time slots for task scheduling.
   *
   * For the first day (today):
   * 1. Starts at the later of:
   *    - Current time + minimum buffer (15 min), rounded up to next 30-min interval
   *    - Work hours start time
   * 2. If the calculated start time is past work hours, moves to next day
   *
   * For future days:
   * - Starts at work hours start time
   *
   * All days:
   * - Generates slots at 30-minute intervals
   * - Each slot has the specified duration
   * - Continues until reaching the end date
   *
   * @param duration - Duration of the task in minutes
   * @param startDate - UTC date to start generating slots from
   * @param endDate - UTC date to stop generating slots at
   * @returns Array of potential time slots
   */
  private generatePotentialSlots(
    duration: number,
    startDate: Date,
    endDate: Date
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const MINIMUM_BUFFER_MINUTES = 15;

    // Convert start and end dates to local time zone
    const localStartDate = toZonedTime(startDate, this.timeZone);
    let localEndDate = toZonedTime(endDate, this.timeZone);
    const localNow = toZonedTime(newDate(), this.timeZone);

    // For the first day, start at the later of:
    // 1. Current time + buffer
    // 2. Work hours start
    let localCurrentStart = localStartDate;

    // If it's today, handle current time
    if (localStartDate.toDateString() === localNow.toDateString()) {
      //question: should we check buffer using the start or the end?
      // Add minimum buffer to current time
      localCurrentStart = addMinutes(localCurrentStart, MINIMUM_BUFFER_MINUTES);

      // If this pushes us past work hours, move to next day at work start
      if (localCurrentStart.getHours() >= this.settings.workHourEnd) {
        localCurrentStart = addDays(
          setMinutes(
            setHours(localCurrentStart, this.settings.workHourStart),
            0
          ),
          1
        );
      }
    } else {
      // For future days, start exactly at work hours start time
      localCurrentStart = setMinutes(
        setHours(localCurrentStart, this.settings.workHourStart),
        0
      );
    }

    localCurrentStart = roundDateUp(localCurrentStart);
    localEndDate = roundDateUp(localEndDate);
    // Generate slots advancing by task duration
    while (localCurrentStart < localEndDate) {
      const slotEnd = addMinutes(localCurrentStart, duration);
      // localCurrentStart/slotEnd hold wall-clock values in the user's
      // timezone; convert back to real UTC instants before storing
      const slot: TimeSlot = {
        start: fromZonedTime(localCurrentStart, this.timeZone),
        end: fromZonedTime(slotEnd, this.timeZone),
        score: 0,
        conflicts: [],
        energyLevel: null,
        isWithinWorkHours: false,
        hasBufferTime: false,
      };

      slots.push(slot);
      localCurrentStart = addMinutes(localCurrentStart, duration);
    }

    return slots;
  }

  private filterByWorkHours(slots: TimeSlot[]): TimeSlot[] {
    const filteredSlots = slots.filter((slot) => {
      // Convert UTC to local time for comparison
      const localStart = toZonedTime(slot.start, this.timeZone);
      const localEnd = toZonedTime(slot.end, this.timeZone);

      const startHour = localStart.getHours();
      const endHour = localEnd.getHours();
      const dayOfWeek = localStart.getDay();

      const workDays = parseWorkDays(this.settings.workDays);
      const isWorkDay = workDays.includes(dayOfWeek);
      const isWithinWorkHours =
        startHour >= this.settings.workHourStart &&
        endHour <= this.settings.workHourEnd &&
        startHour < this.settings.workHourEnd; // Ensure start is before work hours end
      const result = isWorkDay && isWithinWorkHours;
      if (result) {
        slot.isWithinWorkHours = true;
      }
      return result;
    });

    return filteredSlots;
  }

  private isWithinWorkHours(slot: TimeSlot): boolean {
    const localStart = toZonedTime(slot.start, this.timeZone);
    const localEnd = toZonedTime(slot.end, this.timeZone);

    const workDays = parseWorkDays(this.settings.workDays);
    const slotDay = getDay(localStart);

    if (!workDays.includes(slotDay)) {
      return false;
    }

    const startHour = localStart.getHours();
    const endHour = localEnd.getHours();

    return (
      startHour >= this.settings.workHourStart &&
      endHour <= this.settings.workHourEnd &&
      startHour < this.settings.workHourEnd
    );
  }

  /** Loads personal time for a span once; a wider ask extends what is held. */
  private async loadPersonal(userId: string, from: Date, to: Date) {
    const pad = 24 * 3_600_000;
    const lo = from.getTime() - pad;
    const hi = to.getTime() + pad;
    const held = this.personal;
    if (held && held.userId === userId && held.from <= lo && held.to >= hi) {
      return;
    }
    const nextFrom =
      held && held.userId === userId ? Math.min(held.from, lo) : lo;
    const nextTo = held && held.userId === userId ? Math.max(held.to, hi) : hi;
    this.personal = {
      userId,
      from: nextFrom,
      to: nextTo,
      occurrences: await loadPersonalOccurrences(
        userId,
        newDate(nextFrom),
        newDate(nextTo)
      ),
    };
  }

  private inPersonalTime(start: Date, end: Date) {
    return overlapsPersonal(this.personal?.occurrences ?? [], start, end);
  }

  private async findCalendarConflicts(
    slot: TimeSlot,
    userId: string
  ): Promise<Conflict[]> {
    const selectedCalendars = parseSelectedCalendars(
      this.settings.selectedCalendars
    );
    // Only check for conflicts if calendars are selected
    if (selectedCalendars.length === 0) {
      return [];
    }

    return this.calendarService.findConflicts(slot, selectedCalendars, userId);
  }

  private hasInMemoryConflict(slot: TimeSlot): boolean {
    // Check all project tasks for conflicts
    for (const [, projectTasks] of this.slotScorer
      .getScheduledTasks()
      .entries()) {
      for (const projectTask of projectTasks) {
        if (
          areIntervalsOverlapping(
            { start: slot.start, end: slot.end },
            { start: projectTask.start, end: projectTask.end }
          )
        ) {
          return true;
        }
      }
    }
    return false;
  }

  private async removeConflicts(
    slots: TimeSlot[],
    task: Task
  ): Promise<TimeSlot[]> {
    const availableSlots: TimeSlot[] = [];
    const selectedCalendars = parseSelectedCalendars(
      this.settings.selectedCalendars
    );

    // Prepare slots for batch checking
    const slotsToCheck = slots.map((slot) => ({
      slot,
      taskId: task.id,
    }));

    // Batch check conflicts
    const batchResults = await this.calendarService.findBatchConflicts(
      slotsToCheck,
      selectedCalendars,
      task.userId || "",
      task.id
    );

    // Process results and check for conflicts with in-memory scheduled tasks
    for (const result of batchResults) {
      // Add null check to prevent "Cannot read properties of undefined (reading 'slot')"
      if (!result || !result.slot) {
        continue;
      }

      if (result.conflicts.length === 0) {
        // Check for conflicts with in-memory scheduled tasks
        if (!this.hasInMemoryConflict(result.slot)) {
          availableSlots.push(result.slot);
        }
      } else {
        result.slot.conflicts = result.conflicts;
      }
    }

    return availableSlots;
  }

  private async filterSlotsWithAvailableBuffers(
    slots: TimeSlot[],
    userId: string
  ): Promise<TimeSlot[]> {
    const availableSlots: TimeSlot[] = [];

    for (const slot of slots) {
      if (await this.hasAvailableBuffers(slot, userId)) {
        availableSlots.push({ ...slot, hasBufferTime: true });
      }
    }

    return availableSlots;
  }

  private async hasAvailableBuffers(
    slot: TimeSlot,
    userId: string
  ): Promise<boolean> {
    if (this.settings.bufferMinutes <= 0) return true;

    const { beforeBuffer, afterBuffer } = this.calculateBufferTimes(slot);
    const buffers = [beforeBuffer, afterBuffer];

    for (const buffer of buffers) {
      if (!buffer.isWithinWorkHours || this.hasInMemoryConflict(buffer)) {
        return false;
      }
      await this.loadPersonal(userId, buffer.start, buffer.end);
      if (this.inPersonalTime(buffer.start, buffer.end)) return false;

      if ((await this.findCalendarConflicts(buffer, userId)).length > 0) {
        return false;
      }
    }

    return true;
  }

  private scoreSlot(slot: TimeSlot): number {
    const score = this.calculateBaseScore(slot);
    return score;
  }

  private calculateBaseScore(slot: TimeSlot): number {
    // Prefer earlier slots
    const now = newDate();
    const hoursSinceNow = differenceInHours(slot.start, now);
    return -hoursSinceNow; // Higher score for earlier slots
  }

  private scoreSlots(slots: TimeSlot[], task: Task): TimeSlot[] {
    return slots.map((slot) => {
      const score = this.slotScorer.scoreSlot(slot, task);
      return {
        ...slot,
        score: score.total,
      };
    });
  }

  private sortByScore(slots: TimeSlot[]): TimeSlot[] {
    return [...slots].sort((a, b) => b.score - a.score);
  }

  async addScheduledTaskConflict(task: Task): Promise<void> {
    if (task.scheduledStart && task.scheduledEnd) {
      // Add this task to the list of scheduled tasks
      // This will make it show up as a conflict for future slot checks
      const projectId = task.projectId || "none";
      const projectTasks =
        this.slotScorer.getScheduledTasks().get(projectId) || [];
      projectTasks.push({
        start: task.scheduledStart,
        end: task.scheduledEnd,
      });
      this.slotScorer.getScheduledTasks().set(projectId, projectTasks);
    }
  }
}
