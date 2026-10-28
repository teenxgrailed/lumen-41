import type { SampleTask } from "@/services/onboarding/sample-content";

/**
 * What a sandbox account holds after every reset (docs/sandbox-accounts.md):
 * a planner a directory reviewer can read and change in a minute. Days are
 * offsets from the account's today, times are wall-clock in its zone.
 */

export interface SandboxProject {
  key: "launch" | "home";
  name: string;
  description: string;
}

export interface SandboxTask extends SampleTask {
  project: SandboxProject["key"];
  /** Done yesterday. */
  done?: boolean;
  /** Counts toward the goal. */
  goal?: boolean;
}

export const SANDBOX_PROJECTS: readonly SandboxProject[] = [
  {
    key: "launch",
    name: "Product launch",
    description: "Everything that has to happen before the public launch.",
  },
  {
    key: "home",
    name: "Home",
    description: "Errands and plans outside work.",
  },
];

export const SANDBOX_TASKS: readonly SandboxTask[] = [
  {
    project: "launch",
    title: "Draft the launch announcement",
    estimate: 60,
    due: 0,
    at: "10:00",
    priority: "high",
    goal: true,
    subtasks: ["Headline", "Three key points", "Call to action"],
  },
  {
    project: "launch",
    title: "Review the pricing page copy",
    estimate: 30,
    due: 0,
    at: "14:00",
    note: "Check the yearly price and the FAQ.",
  },
  {
    project: "launch",
    title: "Prepare the demo",
    estimate: 90,
    due: 1,
    at: "11:00",
    priority: "high",
    goal: true,
  },
  {
    project: "launch",
    title: "Send the beta invites",
    estimate: 30,
    due: 3,
  },
  {
    project: "launch",
    title: "Write the release notes",
    estimate: 45,
    due: -1,
    done: true,
    goal: true,
  },
  {
    project: "home",
    title: "Book a dentist appointment",
    estimate: 15,
    due: 0,
    at: "17:30",
    priority: "low",
  },
  {
    project: "home",
    title: "Plan the weekend hike",
    estimate: 30,
    due: 1,
    at: "18:00",
  },
  {
    project: "home",
    title: "Renew the passport",
    estimate: 20,
    due: 7,
    note: "Photos are in the desk drawer.",
  },
];

export interface SandboxEvent {
  title: string;
  day: number;
  at: string;
  minutes: number;
  location?: string;
}

export const SANDBOX_EVENTS: readonly SandboxEvent[] = [
  { title: "Team sync", day: 0, at: "15:00", minutes: 30 },
  { title: "1:1 with Sam", day: 1, at: "09:30", minutes: 30 },
  {
    title: "Lunch with Alex",
    day: 2,
    at: "12:30",
    minutes: 60,
    location: "Corner café",
  },
];

export interface SandboxDoc {
  title: string;
  project?: SandboxProject["key"];
  markdown: string;
}

export const SANDBOX_DOCS: readonly SandboxDoc[] = [
  {
    title: "Launch plan",
    project: "launch",
    markdown: [
      "# Launch plan",
      "",
      "The public launch goes out at the end of the month.",
      "",
      "## Before launch",
      "",
      "- Announcement drafted and reviewed",
      "- Pricing page final",
      "- Demo recorded",
      "",
      "## Launch day",
      "",
      "1. Publish the announcement",
      "2. Send the beta invites",
      "3. Watch support for the first hours",
    ].join("\n"),
  },
  {
    title: "Reading notes",
    markdown: [
      "# Reading notes",
      "",
      "Short notes from what I read this month.",
      "",
      "## Deep Work",
      "",
      "Protect long blocks in the morning. Meetings go after lunch.",
      "",
      "## Shape Up",
      "",
      "Fixed time, variable scope: decide the appetite before the solution.",
    ].join("\n"),
  },
];

export interface SandboxHabit {
  title: string;
  at: string;
  minutes: number;
  perWeek: number;
  daysOfWeek: readonly number[];
  /** Days ago it was done (1 = yesterday). */
  doneDaysAgo: readonly number[];
}

export const SANDBOX_HABITS: readonly SandboxHabit[] = [
  {
    title: "Morning walk",
    at: "07:30",
    minutes: 20,
    perWeek: 5,
    daysOfWeek: [1, 2, 3, 4, 5],
    doneDaysAgo: [1, 2, 3],
  },
  {
    title: "Read 20 pages",
    at: "21:00",
    minutes: 20,
    perWeek: 4,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    doneDaysAgo: [1, 3],
  },
];

export const SANDBOX_GOAL = {
  title: "Ship the public launch",
  description: "Get Needt in front of the first thousand people.",
  deadlineDays: 30,
  targetValue: 10,
  currentValue: 6,
  unit: "milestones",
  checkInNote: "Announcement and demo are the last big pieces.",
} as const;

export const SANDBOX_MEMORIES = [
  {
    kind: "preference",
    content: "Prefers deep work in the morning and meetings after lunch.",
  },
  {
    kind: "fact",
    content: "Working on a product launch with a small team.",
  },
] as const;
