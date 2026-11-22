/**
 * Learn's storage: topics and lessons, always scoped to the person who owns
 * them. Every read and write here takes the `userId` from the authenticated
 * request, never from the body, and every write filters on it too
 * (`updateMany` / `deleteMany` with `userId`), so one person cannot reach
 * another's topics by guessing an id (a foreign id answers NOT_FOUND).
 */
import { OpError } from "@/services/ops";
import { userTimeZone } from "@/services/ops/helpers";
import type { LearnLesson, LearnTopic, Prisma } from "@prisma/client";
import { SubscriptionPlan } from "@prisma/client";

import { newDate, startOfDayInTimeZone } from "@/lib/date-utils";
import { getPlan } from "@/lib/entitlements";
import { sampleTopic } from "@/lib/learn/samples";
import {
  LEARN_COLORS,
  LEARN_ICONS,
  LEARN_LIMITS,
  type LearnColor,
  type LearnIcon,
  type LearnLessonDraft,
  type LearnTopicInput,
  learnLessonBodySchema,
} from "@/lib/learn/schema";
import {
  FREE_LESSONS_PER_DAY,
  type LearnLessonView,
  type LearnOverview,
  type LearnTopicView,
} from "@/lib/needt3/learn";
import { prisma } from "@/lib/prisma";

const asColor = (v: string): LearnColor =>
  (LEARN_COLORS as readonly string[]).includes(v) ? (v as LearnColor) : "plain";
const asIcon = (v: string | null): LearnIcon | null =>
  v && (LEARN_ICONS as readonly string[]).includes(v) ? (v as LearnIcon) : null;

/** A lesson row, with or without its body (the overview leaves it out). */
type LessonRow = Omit<LearnLesson, "body"> & { body?: LearnLesson["body"] };

/** Every column but the body: what the overview reads. */
const LESSON_NO_BODY = {
  id: true,
  topicId: true,
  userId: true,
  title: true,
  source: true,
  minutes: true,
  status: true,
  order: true,
  scheduledTaskId: true,
  completedAt: true,
  firstCompletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** `scheduledTaskId` while "Put in calendar" is making the task. */
export const SCHEDULE_PENDING = "pending";

export function lessonView(l: LessonRow, withBody: boolean): LearnLessonView {
  const body =
    withBody && l.body !== undefined
      ? learnLessonBodySchema.safeParse(l.body)
      : null;
  return {
    id: l.id,
    topicId: l.topicId,
    title: l.title,
    source: l.source,
    minutes: l.minutes,
    status: l.status === "done" ? "done" : "new",
    scheduledTaskId:
      l.scheduledTaskId === SCHEDULE_PENDING ? null : l.scheduledTaskId,
    completedAt: l.completedAt ? l.completedAt.toISOString() : null,
    ...(body?.success ? { body: body.data } : {}),
  };
}

export function topicView(
  t: LearnTopic & { lessons: LessonRow[] },
  withBody: boolean
): LearnTopicView {
  return {
    id: t.id,
    title: t.title,
    color: asColor(t.color),
    icon: asIcon(t.icon),
    goal: t.goal,
    level: t.level,
    sampleKey: t.sampleKey,
    sample: false,
    lessons: t.lessons.map((l) => lessonView(l, withBody)),
  };
}

const LESSON_ORDER = {
  orderBy: [{ order: "asc" as const }, { createdAt: "asc" as const }],
};

export async function isProLearner(userId: string) {
  return (await getPlan(userId)) !== SubscriptionPlan.FREE;
}

/**
 * Distinct lessons first finished since midnight in the person's zone.
 * `firstCompletedAt` is set once and never cleared, so marking a lesson new
 * and done again cannot free up Free's daily lesson.
 */
export async function lessonsDoneToday(userId: string) {
  const zone = await userTimeZone(prisma, userId);
  const since = startOfDayInTimeZone(newDate(), zone);
  return prisma.learnLesson.count({
    where: { userId, firstCompletedAt: { gte: since } },
  });
}

export async function learnOverview(userId: string): Promise<LearnOverview> {
  const [topics, completed, pro] = await Promise.all([
    prisma.learnTopic.findMany({
      where: { userId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: { lessons: { ...LESSON_ORDER, select: LESSON_NO_BODY } },
      take: LEARN_LIMITS.topics,
    }),
    lessonsDoneToday(userId),
    isProLearner(userId),
  ]);
  return {
    topics: topics.map((t) => topicView(t, false)),
    today: { completed, limit: pro ? null : FREE_LESSONS_PER_DAY },
  };
}

async function ownedTopic(userId: string, topicId: string) {
  const topic = await prisma.learnTopic.findFirst({
    where: { id: topicId, userId },
    include: { lessons: LESSON_ORDER },
  });
  if (!topic) throw new OpError("NOT_FOUND", "Topic not found");
  return topic;
}

export async function getTopic(userId: string, topicId: string) {
  return topicView(await ownedTopic(userId, topicId), true);
}

async function nextTopicOrder(userId: string) {
  const last = await prisma.learnTopic.findFirst({
    where: { userId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return (last?.order ?? 0) + 1;
}

async function assertTopicRoom(userId: string) {
  const count = await prisma.learnTopic.count({ where: { userId } });
  if (count >= LEARN_LIMITS.topics)
    throw new OpError("CONFLICT", "Too many topics");
}

export async function createTopic(userId: string, input: LearnTopicInput) {
  await assertTopicRoom(userId);
  const topic = await prisma.learnTopic.create({
    data: {
      userId,
      title: input.title,
      color: input.color ?? "violet",
      icon: input.icon ?? null,
      goal: input.goal || null,
      level: input.level || null,
      order: await nextTopicOrder(userId),
    },
    include: { lessons: true },
  });
  return topicView(topic, true);
}

/**
 * "Make it mine": a sample copied into the person's own topics, no AI. Doing
 * it twice (or two taps at once, which `@@unique([userId, sampleKey])` turns
 * into one row) answers the same topic. It counts against the topics cap.
 */
export async function adoptSample(userId: string, key: string) {
  const sample = sampleTopic(key);
  if (!sample) throw new OpError("NOT_FOUND", "Sample not found");
  const find = () =>
    prisma.learnTopic.findFirst({
      where: { userId, sampleKey: sample.key },
      include: { lessons: LESSON_ORDER },
    });
  const existing = await find();
  if (existing) return topicView(existing, true);
  await assertTopicRoom(userId);
  const order = await nextTopicOrder(userId);
  try {
    const topic = await prisma.learnTopic.create({
      data: {
        userId,
        title: sample.title,
        color: sample.color,
        icon: sample.icon,
        goal: sample.goal,
        level: sample.level,
        sampleKey: sample.key,
        order,
        lessons: {
          create: sample.lessons.map((l, i) => ({
            userId,
            title: l.title,
            source: l.source,
            minutes: l.minutes,
            body: l.body as Prisma.InputJsonValue,
            order: i + 1,
          })),
        },
      },
      include: { lessons: LESSON_ORDER },
    });
    return topicView(topic, true);
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    const made = await find();
    if (!made) throw error;
    return topicView(made, true);
  }
}

export async function updateTopic(
  userId: string,
  topicId: string,
  patch: Partial<Omit<LearnTopicInput, "icon">> & {
    /** null clears the sticker. */
    icon?: LearnIcon | null;
    order?: number;
  }
) {
  const { count } = await prisma.learnTopic.updateMany({
    where: { id: topicId, userId },
    data: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
      ...(patch.goal !== undefined ? { goal: patch.goal || null } : {}),
      ...(patch.level !== undefined ? { level: patch.level || null } : {}),
      ...(patch.order !== undefined ? { order: patch.order } : {}),
    },
  });
  if (!count) throw new OpError("NOT_FOUND", "Topic not found");
  return getTopic(userId, topicId);
}

export async function deleteTopic(userId: string, topicId: string) {
  const { count } = await prisma.learnTopic.deleteMany({
    where: { id: topicId, userId },
  });
  if (!count) throw new OpError("NOT_FOUND", "Topic not found");
}

/** Lessons appended to a topic (the AI's, already validated). */
export async function addLessons(
  userId: string,
  topicId: string,
  drafts: readonly LearnLessonDraft[],
  source = "AI"
) {
  const topic = await ownedTopic(userId, topicId);
  if (topic.lessons.length + drafts.length > LEARN_LIMITS.lessonsPerTopic)
    throw new OpError("CONFLICT", "This topic has too many lessons");
  const start = topic.lessons.reduce((m, l) => Math.max(m, l.order), 0);
  await prisma.learnLesson.createMany({
    data: drafts.map((d, i) => ({
      topicId,
      userId,
      title: d.title,
      source,
      minutes: d.minutes,
      body: d.body as Prisma.InputJsonValue,
      order: start + i + 1,
    })),
  });
  return getTopic(userId, topicId);
}

async function ownedLesson(userId: string, lessonId: string) {
  const lesson = await prisma.learnLesson.findFirst({
    where: { id: lessonId, userId },
  });
  if (!lesson) throw new OpError("NOT_FOUND", "Lesson not found");
  return lesson;
}

export async function getLesson(userId: string, lessonId: string) {
  return lessonView(await ownedLesson(userId, lessonId), true);
}

/**
 * Mark a lesson done (or new again). Free: the day's one lesson is the only
 * one that can be finished; a second answers UPGRADE_REQUIRED. A lesson that
 * was finished before, on any day, never counts again. The screen checks
 * first and shows the promo before the lesson opens, so this is the server's
 * backstop, not the wall a person meets.
 */
export async function setLessonStatus(
  userId: string,
  lessonId: string,
  status: "new" | "done"
) {
  const lesson = await ownedLesson(userId, lessonId);
  if (status === "done" && !lesson.firstCompletedAt) {
    if (!(await isProLearner(userId))) {
      if ((await lessonsDoneToday(userId)) >= FREE_LESSONS_PER_DAY)
        throw new OpError(
          "UPGRADE_REQUIRED",
          "Free includes one lesson a day. Learn without limit with Pro."
        );
    }
  }
  const now = newDate();
  await prisma.learnLesson.updateMany({
    where: { id: lessonId, userId },
    data:
      status === "done"
        ? {
            status: "done",
            completedAt: lesson.completedAt ?? now,
            firstCompletedAt: lesson.firstCompletedAt ?? now,
          }
        : { status: "new", completedAt: null },
  });
  return getLesson(userId, lessonId);
}

export type ScheduleClaim =
  | { state: "claimed"; lesson: LearnLesson; previous: string | null }
  | { state: "scheduled"; taskId: string };

/**
 * "Put in calendar", step one: claim the lesson so two taps cannot make two
 * tasks. A lesson with no task is claimed by moving its `scheduledTaskId`
 * from null to "pending" in one conditional write; one whose task was deleted
 * or archived since is claimed again the same way. A live task is answered as
 * it is; a claim already in flight answers CONFLICT.
 */
export async function claimLessonSchedule(
  userId: string,
  lessonId: string
): Promise<ScheduleClaim> {
  const lesson = await ownedLesson(userId, lessonId);
  const previous = lesson.scheduledTaskId;
  if (previous === SCHEDULE_PENDING)
    throw new OpError("CONFLICT", "Already being added to the calendar");
  if (previous) {
    const live = await prisma.task.findFirst({
      where: { id: previous, userId, archivedAt: null },
      select: { id: true },
    });
    if (live) return { state: "scheduled", taskId: previous };
  }
  const { count } = await prisma.learnLesson.updateMany({
    where: { id: lessonId, userId, scheduledTaskId: previous },
    data: { scheduledTaskId: SCHEDULE_PENDING },
  });
  if (!count)
    throw new OpError("CONFLICT", "Already being added to the calendar");
  return { state: "claimed", lesson, previous };
}

/** Step two: the task exists; the lesson keeps its id. */
export async function finishLessonSchedule(
  userId: string,
  lessonId: string,
  taskId: string
) {
  await prisma.learnLesson.updateMany({
    where: { id: lessonId, userId, scheduledTaskId: SCHEDULE_PENDING },
    data: { scheduledTaskId: taskId },
  });
  return getLesson(userId, lessonId);
}

/** The task could not be made: the claim goes back to what it was. */
export async function releaseLessonSchedule(
  userId: string,
  lessonId: string,
  previous: string | null
) {
  await prisma.learnLesson.updateMany({
    where: { id: lessonId, userId, scheduledTaskId: SCHEDULE_PENDING },
    data: { scheduledTaskId: previous },
  });
}

export { ownedLesson, ownedTopic };
