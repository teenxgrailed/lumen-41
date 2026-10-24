/**
 * What the onboarding offers: 12 areas, about 60 tasks with real lengths,
 * repeats and a preferred part of day, and three small rituals. Ported 1:1
 * from the design's ob3-data.js; ids are stable (`<area><index>`) because
 * saved answers refer to them.
 *
 * Safe for the client and the server: no Prisma, no secrets.
 */

/** work = workdays only; life = any day (days off included). */
export type AreaKind = "work" | "life";

/** m = morning, a = afternoon, e = evening, "" = no preference. */
export type DayPart = "m" | "a" | "e" | "";

export interface Area {
  id: string;
  name: string;
  sub: string;
  glyph: string;
  /** Area colours are content, not chrome: they may fill. */
  color: string;
  kind: AreaKind;
}

export interface CatalogTask {
  id: string;
  area: string;
  title: string;
  minutes: number;
  /** Times a week. */
  rep: number;
  when: DayPart;
  /** The two suggestions that are already on when the area is picked. */
  top: boolean;
}

export const AREAS: readonly Area[] = (
  [
    [
      "work",
      "Work",
      "Projects, meetings, reports",
      "projects",
      "#5b4ee6",
      "work",
    ],
    [
      "clients",
      "Clients",
      "Freelance work, invoices, revisions",
      "booking",
      "#2f7de1",
      "work",
    ],
    [
      "side",
      "Side business",
      "Listings, orders, buyers",
      "stack",
      "#e0752d",
      "work",
    ],
    ["study", "Study", "Lectures, homework, exams", "book", "#1f9d8a", "work"],
    [
      "jobs",
      "Job search",
      "Applications, CV, interviews",
      "page",
      "#64748b",
      "work",
    ],
    [
      "fitness",
      "Fitness",
      "Gym, runs, stretching",
      "habits",
      "#e5484d",
      "life",
    ],
    [
      "health",
      "Health",
      "Appointments, meals, walks",
      "shield",
      "#d6409f",
      "life",
    ],
    ["home", "Home", "Groceries, laundry, bills", "home", "#a07a3c", "life"],
    [
      "people",
      "Family & friends",
      "Calls, plans, birthdays",
      "people",
      "#f0a020",
      "life",
    ],
    [
      "creative",
      "Creative",
      "Photos, music, writing",
      "moodboards",
      "#9b51e0",
      "life",
    ],
    [
      "language",
      "Languages",
      "Lessons, apps, vocabulary",
      "glossary",
      "#0ea5e9",
      "life",
    ],
    [
      "money",
      "Money",
      "Budget, taxes, subscriptions",
      "wallet",
      "#1f9d55",
      "life",
    ],
  ] as const
).map(([id, name, sub, glyph, color, kind]) => ({
  id,
  name,
  sub,
  glyph,
  color,
  kind,
}));

type Row = readonly [string, number, number, DayPart];

const ROWS: Record<string, readonly Row[]> = {
  work: [
    ["Reply to emails", 30, 1, "m"],
    ["Write the weekly report", 60, 1, ""],
    ["Prep for Thursday’s review", 45, 1, ""],
    ["Deep work on the main project", 120, 2, "m"],
    ["Update the team", 15, 1, "a"],
    ["Plan next sprint", 60, 1, ""],
  ],
  clients: [
    ["Client revisions", 90, 1, ""],
    ["Send the invoice", 15, 1, ""],
    ["Write a proposal", 60, 1, "m"],
    ["Follow up with leads", 20, 2, "a"],
    ["Prep the kickoff call", 30, 1, ""],
  ],
  side: [
    ["List 3 items", 45, 2, ""],
    ["Ship orders", 30, 3, "a"],
    ["Answer buyer messages", 20, 3, "e"],
    ["Shoot product photos", 90, 1, "a"],
    ["Post on Instagram", 30, 2, "e"],
    ["Restock check", 20, 1, ""],
  ],
  study: [
    ["Review the lecture", 60, 2, ""],
    ["Homework", 60, 2, "a"],
    ["Read chapter 4", 60, 1, "e"],
    ["Exam prep", 90, 2, "m"],
    ["Flashcards", 15, 5, "m"],
  ],
  jobs: [
    ["Apply to 3 jobs", 60, 2, "m"],
    ["Update the CV", 60, 1, ""],
    ["Write a cover letter", 45, 1, ""],
    ["Prep for the interview", 60, 1, ""],
    ["Reply to recruiters", 20, 2, "a"],
  ],
  fitness: [
    ["Gym", 60, 3, "e"],
    ["Run 5 km", 40, 2, "m"],
    ["Stretching", 15, 5, "e"],
    ["Yoga class", 60, 1, "e"],
  ],
  health: [
    ["Walk outside", 30, 5, "a"],
    ["Meal prep", 60, 1, "e"],
    ["Book the dentist", 10, 1, ""],
    ["Pharmacy", 20, 1, ""],
    ["Doctor’s appointment", 60, 1, "m"],
  ],
  home: [
    ["Groceries", 40, 2, "e"],
    ["Laundry", 30, 1, ""],
    ["Clean the flat", 60, 1, ""],
    ["Pay the bills", 15, 1, ""],
    ["Post office", 20, 1, "a"],
    ["Fix the shelf", 30, 1, ""],
  ],
  people: [
    ["Call mom", 20, 2, "e"],
    ["Plan the weekend", 15, 1, ""],
    ["Birthday gift for Ana", 30, 1, ""],
    ["Dinner with friends", 120, 1, "e"],
  ],
  creative: [
    ["Edit the photo set", 90, 1, ""],
    ["Sketch ideas", 45, 2, ""],
    ["Practice an instrument", 30, 3, "e"],
    ["Write 500 words", 45, 3, "m"],
  ],
  language: [
    ["Duolingo", 15, 7, "m"],
    ["German lesson", 60, 2, ""],
    ["Vocabulary review", 15, 5, "e"],
    ["Watch a show in German", 45, 1, "e"],
  ],
  money: [
    ["Budget review", 30, 1, ""],
    ["Tax documents", 60, 1, ""],
    ["Cancel unused subscriptions", 15, 1, ""],
    ["Check the bank", 10, 2, ""],
  ],
};

export const CATALOG_TASKS: readonly CatalogTask[] = Object.entries(
  ROWS
).flatMap(([area, rows]) =>
  rows.map(([title, minutes, rep, when], i) => ({
    id: `${area}${i}`,
    area,
    title,
    minutes,
    rep,
    when,
    top: i < 2,
  }))
);

/** Small rituals that keep a week on track. They become Habits. */
export interface Ritual {
  id: string;
  title: string;
  minutes: number;
  rep: number;
  when: DayPart;
  sub: string;
}

export const RITUALS: readonly Ritual[] = [
  {
    id: "fix-review",
    title: "Weekly review",
    minutes: 30,
    rep: 1,
    when: "a",
    sub: "Friday afternoon: what got done, what moves",
  },
  {
    id: "fix-plan",
    title: "Plan tomorrow",
    minutes: 10,
    rep: 5,
    when: "e",
    sub: "Ten minutes at the end of each workday",
  },
  {
    id: "fix-inbox",
    title: "Inbox zero",
    minutes: 20,
    rep: 2,
    when: "m",
    sub: "Clear mail twice a week",
  },
];

export const areaById = (id: string): Area | undefined =>
  AREAS.find((a) => a.id === id);

export const catalogTaskById = (id: string): CatalogTask | undefined =>
  CATALOG_TASKS.find((t) => t.id === id);

export const ritualById = (id: string): Ritual | undefined =>
  RITUALS.find((r) => r.id === id);

/** Monday-first weekday labels, as the design shows them (0 = Monday). */
export const WEEKDAY_SHORT = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;
export const WEEKDAY_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
