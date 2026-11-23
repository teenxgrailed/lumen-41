/* IDEA CARDS, the plain data. The server (`GET /api/ideas/cards`) decides which
   ideas show today (at most 2 a day, least recently shown first) and where; the
   screen only draws them. The field names line up with the design lab's
   `IdeaData` (id, icon, hue, project, minutes, title) so a card maps one to one;
   `projectId`, `source`, `skipCount` and `after` are what the lab does not need
   to draw but the screens do (the project link, a short source label, the row
   hint, whether the card was already marked shown). Reading the cards never
   marks one shown: the screen calls `markShown(id, after)` when it actually
   draws the card. No title ever goes to analytics (src/services/ideas). */

/** One card, as the server sends it. */
export interface IdeaCardData {
  id: string;
  /** The idea's own text: "Check AI agents news". */
  title: string;
  /** The person's icon key (`Task.icon`), or null for the automatic one. */
  icon: string | null;
  /** The idea's project, or null. */
  projectId: string | null;
  /** The project's name, or null. */
  project: string | null;
  /** What the project draws in (a CSS colour), or null without a project. */
  hue: string | null;
  /** How long taking it is planned for. */
  minutes: number;
  /** user | converted | agent */
  source: string;
  /** How often it was skipped (0 to 2: the 3rd archives it). */
  skipCount: number;
  /** Sits after this many visible tasks (0 = the only row). */
  after: number;
  /** Already marked shown today: `markShown` is a no-op for it. */
  shown: boolean;
}

export interface IdeaCardsResponse {
  /** The local day the cards are for. */
  day: string;
  cards: IdeaCardData[];
  /** Why there are none: off | surface | other_day | no_ideas. */
  none?: "off" | "surface" | "other_day" | "no_ideas";
}

/** What Take answered: the task it became and where it was placed. */
export interface IdeaTakeResult {
  task: { id: string; title: string };
  /** Where the scheduler put it, or null when no slot was found yet. */
  placed: { start: string; end: string | null; today: boolean } | null;
  /** The day it was aimed at (a later day when today had no room). */
  day: string | null;
}

/** The screens that never show a card: the evening review and the day plan. */
export type IdeaCardSurface = "today" | "home" | "review" | "plan";
