import type { StarterGroup, StarterScreen } from "@/lib/starter-game";

/**
 * The Starter game's fixed words and shapes (sg-game.jsx SG_GROUPS, SG_ENTRY,
 * SG_Q). The tiles themselves come from the one agent request; nothing here
 * is a stand-in for it.
 */

export interface SgGroup {
  id: StarterGroup;
  name: string;
  sub: string;
  /** CSS colour of the lane and its solved bar (the project colour set). */
  hue: string;
}

export const SG_GROUPS: readonly SgGroup[] = [
  {
    id: "today",
    name: "Today",
    sub: "gets a slot today",
    hue: "var(--sg-today)",
  },
  {
    id: "week",
    name: "This week",
    sub: "planned across the week",
    hue: "var(--sg-week)",
  },
  { id: "habit", name: "Habit", sub: "repeats", hue: "var(--sg-habit)" },
  {
    id: "project",
    name: "Project",
    sub: "bigger, with first steps",
    hue: "var(--sg-project)",
  },
];

export const sgGroup = (id: StarterGroup): SgGroup =>
  SG_GROUPS.find((g) => g.id === id) ?? SG_GROUPS[0];

export interface SgEntryCopy {
  title: string;
  p: string;
  /** The lane the entry preview settles into. */
  first: StarterGroup;
  /** The preview bar's label. */
  bar: string;
  /** The chat's opening line. */
  intro: string;
}

export const SG_ENTRY: Record<StarterScreen, SgEntryCopy> = {
  home: {
    title: "Sort out your day",
    p: "Three quick questions, then sort what Needt heard into today, this week, habits and projects. About a minute.",
    first: "today",
    bar: "Today",
    intro: "Let’s fill today with what’s actually on your plate.",
  },
  calendar: {
    title: "Fill your week",
    p: "Three quick questions — Needt turns the answers into tasks and places them around your events.",
    first: "week",
    bar: "This week",
    intro: "Let’s fill your week.",
  },
  tasks: {
    title: "Empty your head",
    p: "Three quick questions, then sort. Bigger things become projects with their first steps.",
    first: "project",
    bar: "Project",
    intro: "Let’s get it out of your head.",
  },
};

export interface SgQuestion {
  id: "do" | "burn" | "reg";
  ask: string;
  hint: string;
  multi?: boolean;
  text?: boolean;
  chips?: ReadonlyArray<readonly [string, string]>;
  example?: string;
}

export const SG_Q: readonly SgQuestion[] = [
  {
    id: "do",
    ask: "What do you spend your days on?",
    hint: "Pick any — it shapes what I suggest.",
    multi: true,
    chips: [
      ["💼", "Work"],
      ["🎓", "Study"],
      ["🧾", "Freelance"],
      ["🛍", "Shop / resale"],
      ["📷", "Creative"],
      ["🏋️", "Sport"],
      ["🏠", "Home"],
    ],
  },
  {
    id: "burn",
    ask: "What’s burning this week?",
    hint: "Type it the way you’d say it. Deadlines and people help.",
    text: true,
    example:
      "Demesures drop on Friday, list jackets on Grailed, German homework for Wednesday, return the Swarovski, budget receipts",
  },
  {
    id: "reg",
    ask: "Anything you want to do regularly?",
    hint: "Habits get a gentle daily or weekly check.",
    multi: true,
    text: true,
    chips: [
      ["🦉", "Duolingo daily"],
      ["🏋️", "Lift 3× a week"],
      ["📖", "Read 20 pages"],
      ["🚶", "Walk before work"],
      ["✍️", "Journal"],
      ["🧘", "Stretch"],
    ],
  },
];
