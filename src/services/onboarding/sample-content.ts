/**
 * The first-run "sample day": what each use of Needt gets on Today.
 *
 * Pure data, no Prisma and no clock. `sample-service.ts` turns it into rows.
 * Every use gets the same shape (an overdue task, a task with subtasks, tasks
 * with a time and an estimate, one inbox task, one project, one habit and a
 * "Start here" document) but its own words, so the four are genuinely
 * different days rather than one day with a new title.
 *
 * Writing rules: plain English, specific, calm. No real people's names, no
 * lorem, no exclamation marks, no emoji.
 */

export const SAMPLE_USES = ["work", "study", "personal", "side"] as const;
export type SampleUse = (typeof SAMPLE_USES)[number];

export const isSampleUse = (v: unknown): v is SampleUse =>
  typeof v === "string" && (SAMPLE_USES as readonly string[]).includes(v);

export interface SampleTask {
  title: string;
  /** Minutes of work. */
  estimate: number;
  /**
   * Where it sits. `day` is an offset from today (-1 = yesterday) and `at` a
   * wall-clock "HH:MM" in the person's zone. No `at` means no time: an overdue
   * task keeps only its due day, an inbox task has neither.
   */
  due?: number;
  at?: string;
  /** A short note shown under the title. */
  note?: string;
  subtasks?: readonly string[];
  priority?: "high" | "medium" | "low";
}

export interface SampleHabit {
  title: string;
  /** "HH:MM" the habit is pinned to. */
  at: string;
  minutes: number;
  /** Times per week it aims for. */
  perWeek: number;
  daysOfWeek: readonly number[];
}

export interface SampleDay {
  project: { name: string; description: string };
  tasks: readonly SampleTask[];
  habit: SampleHabit;
  /** The paragraph in "Start here" that is about this use. */
  docIntro: string;
  /** Two or three items for the check list inside "Start here". */
  docTasks: readonly string[];
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6] as const;
const WEEKDAYS = [1, 2, 3, 4, 5] as const;

export const SAMPLE_DAYS: Record<SampleUse, SampleDay> = {
  work: {
    project: {
      name: "Onboarding rewrite",
      description:
        "An example project: a new-customer flow being rewritten over a few weeks. Clear the examples whenever you like.",
    },
    tasks: [
      {
        title: "Write the one-page brief for the onboarding rewrite",
        estimate: 90,
        due: 0,
        at: "09:30",
        priority: "high",
        subtasks: [
          "List what changes for a new customer",
          "Draft the three main steps",
          "Write down the open questions",
          "Send it to the team for comments",
        ],
      },
      {
        title: "Go through last week's support themes",
        estimate: 45,
        due: 0,
        at: "11:30",
        note: "Look for the three that come up most.",
      },
      {
        title: "Prepare the agenda for Thursday's planning meeting",
        estimate: 30,
        due: 0,
        at: "14:00",
      },
      {
        title: "Send the revised timeline to the team",
        estimate: 20,
        due: -1,
        priority: "high",
        note: "Due yesterday. Overdue tasks stay on Today until you finish or move them.",
      },
      {
        title: "Clear the inbox before the end of the day",
        estimate: 25,
        due: 0,
        at: "16:30",
      },
      {
        title: "Book a room for the quarterly check-in",
        estimate: 10,
        note: "No day yet, so it waits in your inbox.",
      },
    ],
    habit: {
      title: "Plan tomorrow before logging off",
      at: "17:30",
      minutes: 10,
      perWeek: 5,
      daysOfWeek: WEEKDAYS,
    },
    docIntro:
      "The examples around this document are a working week: one project, a brief with subtasks, a few meetings to prepare for and one task that is already late.",
    docTasks: [
      "Pick the three things that matter most this week",
      "Move anything that can wait to next week",
      "Block an hour for the brief",
    ],
  },

  study: {
    project: {
      name: "Statistics course",
      description:
        "An example project: one course, one term. Clear the examples whenever you like.",
    },
    tasks: [
      {
        title: "Read chapter 4 on sampling",
        estimate: 60,
        due: 0,
        at: "09:30",
        subtasks: [
          "Skim the headings and the summary first",
          "Read sections 4.1 to 4.3 and note the definitions",
          "Write three questions to bring to the seminar",
        ],
      },
      {
        title: "Go over Monday's lecture notes",
        estimate: 40,
        due: 0,
        at: "11:30",
        note: "Rewrite the parts you could not follow in your own words.",
      },
      {
        title: "Do ten practice questions on probability",
        estimate: 45,
        due: 0,
        at: "14:30",
        priority: "high",
      },
      {
        title: "Finish problem set 3",
        estimate: 75,
        due: -1,
        priority: "high",
        note: "Due yesterday. Hand in what you have if the last question is stuck.",
      },
      {
        title: "Write the introduction for the lab report",
        estimate: 60,
        due: 0,
        at: "16:00",
      },
      {
        title: "Ask what the exam will cover",
        estimate: 10,
        note: "No day yet, so it waits in your inbox.",
      },
    ],
    habit: {
      title: "Review flashcards",
      at: "20:00",
      minutes: 15,
      perWeek: 7,
      daysOfWeek: EVERY_DAY,
    },
    docIntro:
      "The examples around this document are one study day: a reading with subtasks, a problem set that is late, and practice spread across the day instead of piled up at night.",
    docTasks: [
      "Write down the date of every deadline this term",
      "Split each assignment into steps of an hour or less",
      "Keep one evening free each week",
    ],
  },

  personal: {
    project: {
      name: "Around the house",
      description:
        "An example project: the small jobs that never get a day of their own. Clear the examples whenever you like.",
    },
    tasks: [
      {
        title: "Book the dentist appointment",
        estimate: 15,
        due: 0,
        at: "10:00",
        note: "Ring when the surgery opens. Ask for a morning slot.",
      },
      {
        title: "Pick up the dry cleaning",
        estimate: 25,
        due: 0,
        at: "12:30",
      },
      {
        title: "Clear out the hall cupboard",
        estimate: 60,
        due: 0,
        at: "16:00",
        subtasks: [
          "Empty the shelves onto the floor",
          "Sort into keep, donate and bin",
          "Wipe the shelves",
          "Put back only what you use",
        ],
      },
      {
        title: "Plan this week's dinners",
        estimate: 30,
        due: 0,
        at: "18:00",
        note: "Three dinners is plenty. Leave room for leftovers.",
      },
      {
        title: "Renew the bike insurance",
        estimate: 20,
        due: -1,
        priority: "high",
        note: "Due yesterday. The renewal page needs your policy number.",
      },
      {
        title: "Ring a friend you have not spoken to in a while",
        estimate: 20,
        note: "No day yet, so it waits in your inbox.",
      },
    ],
    habit: {
      title: "Walk for twenty minutes",
      at: "18:30",
      minutes: 20,
      perWeek: 5,
      daysOfWeek: WEEKDAYS,
    },
    docIntro:
      "The examples around this document are an ordinary day off the clock: a few errands with a time, one bigger job broken into steps, and a renewal that slipped by a day.",
    docTasks: [
      "Write down the three errands you keep putting off",
      "Give each one a day, even a rough one",
      "Do the shortest one first",
    ],
  },

  side: {
    project: {
      name: "Launch the landing page",
      description:
        "An example project: a side project that only gets evenings and weekends. Clear the examples whenever you like.",
    },
    tasks: [
      {
        title: "Sketch the top of the landing page",
        estimate: 45,
        due: 0,
        at: "07:30",
        note: "Boxes and arrows on paper are enough.",
      },
      {
        title: "Write the three-line pitch",
        estimate: 30,
        due: 0,
        at: "12:30",
        note: "Who it is for, what it does, why it is different.",
      },
      {
        title: "Set up the email sign-up form",
        estimate: 60,
        due: 0,
        at: "19:00",
        priority: "high",
        subtasks: [
          "Pick a mailing tool",
          "Create the list and the form",
          "Put the form on the page",
          "Send yourself a test sign-up",
        ],
      },
      {
        title: "Fix the broken link on the pricing section",
        estimate: 15,
        due: -1,
        priority: "high",
        note: "Due yesterday. A broken link is the cheapest thing to fix before anyone sees it.",
      },
      {
        title: "Reply to the first person who tried the beta",
        estimate: 20,
        due: 0,
        at: "20:30",
      },
      {
        title: "Write down the idea for the second feature",
        estimate: 10,
        note: "No day yet, so it waits in your inbox.",
      },
    ],
    habit: {
      title: "Work on it for thirty minutes",
      at: "07:00",
      minutes: 30,
      perWeek: 5,
      daysOfWeek: WEEKDAYS,
    },
    docIntro:
      "The examples around this document are a side project squeezed around a day job: small tasks at the edges of the day, one with subtasks, and a link that needs fixing.",
    docTasks: [
      "Decide what done looks like for the first version",
      "Cut everything that is not on that list",
      "Set a launch date and tell one person",
    ],
  },
};

/** The sample habit's one-line description. */
export const SAMPLE_HABIT_NOTE =
  "An example habit. It is not counted toward any plan limit.";

export const SAMPLE_DOC_TITLE = "Start here";

/**
 * The "Start here" document, as Markdown for `pageBlocksFromText`. The
 * gestures it names are the real ones: the Task entry of the slash menu, the
 * slash menu itself, and Ask Needt on the J key (and "Ask Needt about this"
 * for a selection).
 */
export function sampleDocMarkdown(use: SampleUse): string {
  const day = SAMPLE_DAYS[use];
  return [
    "This is an example document. It shows three things worth knowing, and then it can go: use Clear examples on Today, or in Settings under Data, and it disappears along with every other example.",
    "",
    day.docIntro,
    "",
    "## Tasks live inside documents",
    "",
    "Type / on an empty line and choose Task. The line becomes a task you can tick off here, and it shows up in your lists too. Try it on the list below.",
    "",
    ...day.docTasks.map((t) => `- [ ] ${t}`),
    "",
    "## The slash menu",
    "",
    "Type / anywhere on a line to see what you can insert: headings, lists, tasks, quotes and code. Keep typing to narrow the list, press Enter to pick one, Escape to leave it.",
    "",
    "## Ask Needt",
    "",
    "Press Cmd J (Ctrl J on Windows and Linux) from anywhere to ask Needt something about your day or your documents. Select a few words first and choose Ask Needt about this to ask about just those. Ask is part of Pro and of the free trial.",
  ].join("\n");
}
