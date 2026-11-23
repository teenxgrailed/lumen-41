import type { Prisma } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { ideaCardsEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";
import { projectColor } from "@/lib/needt3/project-color";
import { prisma } from "@/lib/prisma";
import { openTaskWhere } from "@/lib/tasks/open-task";

import { TAKE_DEFAULT_MINUTES, cardAfter, cardSlots, localDay } from "./rules";

const LOG_SOURCE = "idea-cards";

/** A card, as the client draws it. The server decides which and where. */
export interface IdeaCard {
  id: string;
  title: string;
  /** The person's own icon key (`Task.icon`), or null for the automatic one. */
  icon: string | null;
  projectId: string | null;
  /** The idea's project name, or null. */
  project: string | null;
  /** The project's drawn colour (what a project renders in), or null. */
  hue: string | null;
  /** How long taking it will be planned for. */
  minutes: number;
  /** user | converted | agent */
  source: string;
  skipCount: number;
  /** Sits after this many visible tasks (0 = the only row). */
  after: number;
  /** Already marked shown today (`idea.shown`); the screen marks the rest when it draws them. */
  shown: boolean;
}

export interface IdeaCardsResult {
  /** The local day the cards are for, in the person's zone. */
  day: string;
  cards: IdeaCard[];
  /** Why there are none, when there are none. */
  none?: "off" | "surface" | "other_day" | "no_ideas";
}

export type CardSurface = "today" | "home" | "review" | "plan";

const OPEN = ["todo", "in_progress"];

/**
 * How many open tasks the person has on the local day: what the Today list
 * shows, and what the day's card cap and the card positions are measured
 * against. `idea.cards` and `idea.shown` both count it here, so they never
 * disagree about how many cards the day may have.
 */
export async function countVisibleTasks(
  db: { task: Pick<Prisma.TransactionClient["task"], "count"> },
  input: {
    userId: string;
    scope: Prisma.TaskWhereInput;
    today: { start: Date; end: Date };
  }
): Promise<number> {
  return db.task.count({
    where: {
      ...input.scope,
      userId: input.userId,
      ...openTaskWhere(),
      isArchived: false,
      trashedAt: null,
      somedayAt: null,
      status: { in: OPEN },
      OR: [
        { scheduledStart: { gte: input.today.start, lt: input.today.end } },
        { dueDate: { gte: input.today.start, lt: input.today.end } },
      ],
    },
  });
}

/**
 * The cards for today: at most two ideas per local day, least recently shown
 * first, never-shown first. A read writes nothing (a token with read scope cannot
 * use up the day's slots); the screen marks a card shown with `idea.shown` when it
 * draws it, and a skipped or taken card still counts against the day.
 *
 * Never throws for "nothing to show": it answers with an empty list and why.
 */
export async function readIdeaCards(input: {
  userId: string;
  /** Workspace or personal scope of the ops context. */
  scope: Prisma.TaskWhereInput;
  timeZone: string;
  now?: Date;
  /** The client's local day; another day than today's returns none. */
  day?: string;
  surface?: CardSurface;
  /** How many tasks the list shows; the server counts today's when omitted. */
  visibleTasks?: number;
}): Promise<IdeaCardsResult> {
  const now = input.now ?? newDate();
  const today = localDay(now, input.timeZone);
  const empty = (none: IdeaCardsResult["none"]): IdeaCardsResult => ({
    day: today.key,
    cards: [],
    none,
  });

  // An idea is not planned: no card on the evening review or the plan list.
  if (input.surface === "review" || input.surface === "plan") {
    return empty("surface");
  }
  if (input.day && input.day !== today.key) return empty("other_day");
  if (!(await ideaCardsEnabled(input.userId))) return empty("off");

  const own = { ...input.scope, userId: input.userId };
  const shownToday = { ideaLastShownAt: { gte: today.start, lt: today.end } };
  const offered = {
    isArchived: false,
    trashedAt: null,
    OR: [{ ideaSnoozedUntil: null }, { ideaSnoozedUntil: { lte: now } }],
  };

  const visibleTasks =
    input.visibleTasks ??
    (await countVisibleTasks(prisma, {
      userId: input.userId,
      scope: input.scope,
      today,
    }));

  // Reading never writes: it only says which ideas are today's cards. Those
  // already marked shown today (`idea.shown`, which the screen calls when a card
  // is actually displayed) come first; the rest of the day's slots go to the
  // least recently shown, never-shown first, in one fixed order, so a second
  // read (or another device) names the same cards until something changes.
  // Every idea marked shown today counts, a taken or skipped one included.
  const stamped = await prisma.task.count({
    where: { userId: input.userId, ...shownToday },
  });
  const open = await prisma.task.findMany({
    where: { ...own, kind: "IDEA", ...shownToday, ...offered },
  });
  const slots = cardSlots({ stampedToday: stamped, visibleTasks });
  let fresh: typeof open = [];
  if (slots > 0) {
    const base = { ...own, kind: "IDEA" as const, ...offered };
    // Never shown first, then the one shown longest ago.
    const never = await prisma.task.findMany({
      where: { ...base, ideaLastShownAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: slots,
    });
    const older =
      never.length < slots
        ? await prisma.task.findMany({
            where: { ...base, ideaLastShownAt: { lt: today.start } },
            orderBy: [
              { ideaLastShownAt: "asc" },
              { createdAt: "asc" },
              { id: "asc" },
            ],
            take: slots - never.length,
          })
        : [];
    fresh = [...never, ...older];
  }
  const shownIds = new Set(open.map((idea) => idea.id));
  // One order however the cards were found, and whether or not they were marked
  // shown yet, so the positions do not move when the screen marks one.
  const picked = [...open, ...fresh].sort(
    (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
  );
  if (picked.length === 0) {
    const any = await prisma.task.count({
      where: { ...own, kind: "IDEA", isArchived: false, trashedAt: null },
    });
    return empty(any > 0 ? undefined : "no_ideas");
  }

  const projectIds = [
    ...new Set(
      picked.map((idea) => idea.projectId).filter((id): id is string => !!id)
    ),
  ];
  const projects = projectIds.length
    ? await prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, name: true, color: true },
      })
    : [];
  const byId = new Map(projects.map((project) => [project.id, project]));

  const result: IdeaCard[] = picked.map((idea, index) => {
    const project = idea.projectId ? byId.get(idea.projectId) : undefined;
    return {
      id: idea.id,
      title: idea.title,
      icon: idea.icon ?? null,
      projectId: idea.projectId ?? null,
      project: project?.name ?? null,
      hue: project ? projectColor(project.id, project.color) : null,
      minutes: idea.estimatedMinutes ?? idea.duration ?? TAKE_DEFAULT_MINUTES,
      source: idea.ideaSource ?? "user",
      skipCount: idea.ideaSkipCount ?? 0,
      after: cardAfter(index, visibleTasks),
      shown: shownIds.has(idea.id),
    };
  });

  logger.debug(
    "Idea cards read",
    { userId: input.userId, cards: result.length, shown: shownIds.size },
    LOG_SOURCE
  );
  return { day: today.key, cards: result };
}
