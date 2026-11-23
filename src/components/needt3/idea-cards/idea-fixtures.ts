import type { V3Task } from "@/lib/needt3/map";

/** The lab's day: Monday 23 November 2026. Fixed, so a shot never drifts. */
export const LAB_TODAY = "2026-11-23";

export interface LabProject {
  id: string;
  name: string;
  color: string;
  icon: null;
}

export const LAB_PROJECTS: readonly LabProject[] = [
  { id: "needt", name: "Needt", color: "var(--hue-blue)", icon: null },
  { id: "resale", name: "Resale", color: "var(--hue-green)", icon: null },
  { id: "dms", name: "Demesures", color: "var(--hue-pink)", icon: null },
  { id: "learn", name: "Learning", color: "var(--hue-violet)", icon: null },
  {
    id: "inspo",
    name: "Inspiration",
    color: "var(--hue-orange)",
    icon: null,
  },
];

const BASE: V3Task = {
  id: "base",
  title: "",
  notes: null,
  done: false,
  status: "todo",
  projectId: null,
  dueDate: LAB_TODAY,
  estimatedMinutes: 30,
  scheduledStart: null,
  scheduledEnd: null,
  isFixed: false,
  auto: true,
  noSlot: false,
  entry: null,
  chunk: null,
  splitAllowed: true,
  deadline: null,
  hardDeadline: false,
  priority: "medium",
  holder: null,
  blockedBy: null,
  value: null,
  earned: null,
  Stage: null,
  movedFrom: null,
  trashedAt: null,
  source: null,
  repeat: null,
  scheduleId: null,
  labels: [],
  attachments: [],
  syncedFrom: null,
  createdAt: null,
  updatedAt: null,
  parts: [],
  waits: [],
};

function task(
  id: string,
  title: string,
  projectId: string,
  start: string,
  end: string,
  minutes: number
): V3Task {
  return {
    ...BASE,
    id,
    title,
    projectId,
    estimatedMinutes: minutes,
    scheduledStart: `${LAB_TODAY}T${start}`,
    scheduledEnd: `${LAB_TODAY}T${end}`,
  };
}

/** The tasks of the mock Today, in the order they sit. */
export const MAIN_TASKS: readonly V3Task[] = [
  task("m1", "Draft the launch brief", "needt", "09:00", "10:30", 90),
  task("m2", "Post three jacket listings", "resale", "11:00", "11:30", 30),
];

/** Before the idea card, and after it. */
export const DAY_BEFORE: readonly V3Task[] = [
  task("d1", "Fix the Creem legal pages", "needt", "13:00", "13:20", 20),
];
export const DAY_AFTER: readonly V3Task[] = [
  task("d2", "Print the tech pack for the jacket", "dms", "16:00", "16:45", 45),
  task("d3", "Plan Thursday's shoot", "dms", "17:00", "17:30", 30),
];

/** What a taken idea becomes: a task of its own, placed in the gap. */
export function takenTask(
  title: string,
  projectId: string,
  minutes: number
): V3Task {
  return task("taken", title, projectId, "14:15", "14:30", minutes);
}
