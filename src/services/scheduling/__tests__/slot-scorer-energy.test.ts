import { AutoScheduleSettings, Task } from "@prisma/client";

import { TimeSlot } from "@/types/scheduling";

import { SlotScorer } from "../SlotScorer";

const settings = (over: Partial<AutoScheduleSettings> = {}) =>
  ({
    bufferMinutes: 15,
    workDays: "[1,2,3,4,5]",
    workHourStart: 9,
    workHourEnd: 17,
    highEnergyStart: null,
    highEnergyEnd: null,
    mediumEnergyStart: null,
    mediumEnergyEnd: null,
    lowEnergyStart: null,
    lowEnergyEnd: null,
    ...over,
  }) as AutoScheduleSettings;

const slotAt = (hour: number): TimeSlot => {
  const start = new Date(2026, 7, 10, hour, 0, 0);
  return {
    start,
    end: new Date(2026, 7, 10, hour + 1, 0, 0),
    score: 0,
    conflicts: [],
    energyLevel: null,
    isWithinWorkHours: true,
    hasBufferTime: true,
  };
};

const task = (over: Partial<Task> = {}) =>
  ({
    id: "t",
    title: "Task",
    energyLevel: null,
    energyRequired: "MEDIUM",
    priority: null,
    priorityLevel: "MEDIUM",
    dueDate: null,
    preferredTime: null,
    projectId: null,
    ...over,
  }) as unknown as Task;

const energy = (s: AutoScheduleSettings, hour: number, t: Task) =>
  new SlotScorer(s).scoreSlot(slotAt(hour), t).factors.energyLevelMatch;

describe("SlotScorer energy match", () => {
  it("puts heavy work in the morning by default, light work later", () => {
    const heavy = task({ energyRequired: "HIGH" });
    const light = task({ energyRequired: "LOW" });
    expect(energy(settings(), 10, heavy)).toBe(1);
    expect(energy(settings(), 10, light)).toBe(0);
    // outside the default window nothing is known: neutral
    expect(energy(settings(), 15, heavy)).toBe(0.5);
  });

  it("uses the person's own high-energy hours instead of the morning", () => {
    const own = settings({ highEnergyStart: 14, highEnergyEnd: 17 });
    const heavy = task({ energyRequired: "HIGH" });
    expect(energy(own, 15, heavy)).toBe(1);
    expect(energy(own, 10, heavy)).toBe(0.5);
  });

  it("treats the default MEDIUM as no preference", () => {
    expect(energy(settings(), 10, task())).toBe(0.5);
  });

  it("a task's own energyLevel still wins", () => {
    expect(
      energy(
        settings(),
        10,
        task({ energyLevel: "low", energyRequired: "HIGH" })
      )
    ).toBe(0);
  });
});
