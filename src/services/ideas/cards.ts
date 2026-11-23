import { Prisma } from "@prisma/client";

import { recordActivation } from "@/lib/activation-events";
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
 * The cards for today: at most two ideas per local day, least recently shown
 * first, never-shown first. Reading stamps `ideaLastShownAt`, so a second read
 * (or another device) the same day returns the same ones, and a skipped or
 * taken card still counts against the day.
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
    (await prisma.task.count({
      where: {
        ...own,
        ...openTaskWhere(),
        isArchived: false,
        trashedAt: null,
        somedayAt: null,
        status: { in: OPEN },
        OR: [
          { scheduledStart: { gte: today.start, lt: today.end } },
          { dueDate: { gte: today.start, lt: today.end } },
        ],
      },
    }));

  // Two readers (two devices) at once must not both pick: one at a time per
  // person, and the second sees the first one's stamps.
  const cards = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`idea-cards:${input.userId}`}, 0))`
    );
    // Every idea shown today counts, a taken or skipped one included.
    const stamped = await tx.task.count({
      where: { userId: input.userId, ...shownToday },
    });
    const open = await tx.task.findMany({
      where: { ...own, kind: "IDEA", ...shownToday, ...offered },
      orderBy: [
        { ideaLastShownAt: "asc" },
        { createdAt: "asc" },
        { id: "asc" },
      ],
    });
    const slots = cardSlots({ stampedToday: stamped, visibleTasks });
    let fresh: typeof open = [];
    if (slots > 0) {
      const base = {
        ...own,
        kind: "IDEA" as const,
        ...offered,
      };
      // Never shown first, then the one shown longest ago.
      const never = await tx.task.findMany({
        where: { ...base, ideaLastShownAt: null },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: slots,
      });
      const older =
        never.length < slots
          ? await tx.task.findMany({
              where: { ...base, ideaLastShownAt: { lt: today.start } },
              orderBy: [
                { ideaLastShownAt: "asc" },
                { createdAt: "asc" },
                { id: "asc" },
              ],
              take: slots - never.length,
            })
          : [];
      // One order however they were found, so a second read sorts the same.
      fresh = [...never, ...older].sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id)
      );
      if (fresh.length) {
        await tx.task.updateMany({
          where: { id: { in: fresh.map((idea) => idea.id) }, kind: "IDEA" },
          data: { ideaLastShownAt: now },
        });
      }
    }
    return { open, fresh };
  });

  const picked = [
    ...cards.open,
    ...cards.fresh.map((idea) => ({ ...idea, ideaLastShownAt: now })),
  ];
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
    };
  });

  // One event per card newly shown, by short kinds only: never the title.
  for (const card of result) {
    if (cards.fresh.some((idea) => idea.id === card.id)) {
      recordActivation("idea_shown", input.userId, {
        source: card.source,
        position: card.after,
      });
    }
  }
  logger.debug(
    "Idea cards read",
    { userId: input.userId, cards: result.length, fresh: cards.fresh.length },
    LOG_SOURCE
  );
  return { day: today.key, cards: result };
}
