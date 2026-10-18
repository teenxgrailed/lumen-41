import type { V3Task } from "@/lib/needt3/map";

export const TODAY = "2026-09-01";

let n = 0;
/** A plain open task due today; override what the test is about. */
export const task = (over: Partial<V3Task> = {}): V3Task =>
  ({
    id: `f${++n}`,
    title: `Task ${n}`,
    notes: null,
    done: false,
    status: "todo",
    projectId: null,
    dueDate: TODAY,
    estimatedMinutes: 30,
    scheduledStart: null,
    scheduledEnd: null,
    isFixed: false,
    auto: false,
    noSlot: false,
    priority: "medium",
    trashedAt: null,
    parts: [],
    waits: [],
    ...over,
  }) as V3Task;
