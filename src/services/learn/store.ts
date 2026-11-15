/**
 * Learn's storage: topics and lessons, always scoped to
 * the person who owns them. Every read and write here takes the `userId` from
 * the authenticated request, never from the body, so one person cannot reach
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

export function lessonView(l: LearnLesson, withBody: boolean): LearnLessonView {
  const body = withBody ? learnLessonBodySchema.safeParse(l.body) : null;
  return {
    id: l.id,
    topicId: l.topicId,
    title: l.title,
    source: l.source,
    minutes: l.minutes,
    status: l.status === "done" ? "done" : "new",
    scheduledTaskId: l.scheduledTaskId,
    completedAt: l.completedAt ? l.completedAt.toISOString() : null,
    ...(body?.success ? { body: body.data } : {}),
  };
}

export function topicView(
  t: LearnTopic & { lessons: LearnLesson[] },
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

/** Lessons finished since midnight in the person's zone. */
export async function lessonsDoneToday(userId: string) {
  const zone = await userTimeZone(prisma, userId);
  const since = startOfDayInTimeZone(newDate(), zone);
  return prisma.learnLesson.count({
    where: { userId, completedAt: { gte: since } },
  });
}

export async function learnOverview(userId: string): Promise<LearnOverview> {
  const [topics, completed, pro] = await Promise.all([
    prisma.learnTopic.findMany({
      where: { userId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: { lessons: LESSON_ORDER },
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

export async function createTopic(userId: string, input: LearnTopicInput) {
  const count = await prisma.learnTopic.count({ where: { userId } });
  if (count >= LEARN_LIMITS.topics)
    throw new OpError("CONFLICT", "Too many topics");
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

/** "Make it mine": a sample copied into the person's own topics, no AI. */
export async function adoptSample(userId: string, key: string) {
  const sample = sampleTopic(key);
  if (!sample) throw new OpError("NOT_FOUND", "Sample not found");
  const existing = await prisma.learnTopic.findFirst({
    where: { userId, sampleKey: sample.key },
    include: { lessons: LESSON_ORDER },
  });
  if (existing) return topicView(existing, true);
  const order = await nextTopicOrder(userId);
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
}

export async function updateTopic(
  userId: string,
  topicId: string,
  patch: Partial<LearnTopicInput> & { order?: number }
) {
  await ownedTopic(userId, topicId);
  const topic = await prisma.learnTopic.update({
    where: { id: topicId },
    data: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
      ...(patch.goal !== undefined ? { goal: patch.goal || null } : {}),
      ...(patch.level !== undefined ? { level: patch.level || null } : {}),
      ...(patch.order !== undefined ? { order: patch.order } : {}),
    },
    include: { lessons: LESSON_ORDER },
  });
  return topicView(topic, true);
}

export async function deleteTopic(userId: string, topicId: string) {
  await ownedTopic(userId, topicId);
  await prisma.learnTopic.delete({ where: { id: topicId } });
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
 * one that can be finished; a second answers UPGRADE_REQUIRED. The screen
 * checks first and shows the promo before the lesson opens, so this is the
 * server's backstop, not the wall a person meets.
 */
export async function setLessonStatus(
  userId: string,
  lessonId: string,
  status: "new" | "done"
) {
  const lesson = await ownedLesson(userId, lessonId);
  if (status === "done" && lesson.status !== "done") {
    if (!(await isProLearner(userId))) {
      if ((await lessonsDoneToday(userId)) >= FREE_LESSONS_PER_DAY)
        throw new OpError(
          "UPGRADE_REQUIRED",
          "Free includes one lesson a day. Learn without limit with Pro."
        );
    }
  }
  const updated = await prisma.learnLesson.update({
    where: { id: lessonId },
    data:
      status === "done"
        ? {
            status: "done",
            completedAt: lesson.completedAt ?? newDate(),
          }
        : { status: "new", completedAt: null },
  });
  return lessonView(updated, true);
}

export async function setLessonTask(
  userId: string,
  lessonId: string,
  taskId: string
) {
  await ownedLesson(userId, lessonId);
  const updated = await prisma.learnLesson.update({
    where: { id: lessonId },
    data: { scheduledTaskId: taskId },
  });
  return lessonView(updated, true);
}

export { ownedLesson, ownedTopic };
