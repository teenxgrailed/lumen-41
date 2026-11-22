/**
 * Learn as a place in Needt (openspec `module-blocks-and-learn`; on for
 * everybody, no flag: owner 15.11.26). Pure and client-safe: the nav item,
 * the shapes the REST routes answer with, and the rules the screens share.
 *
 * The person names the topics ("Deutsch", "Design", "Finance"); the AI writes
 * the lessons (Pro). Free reads one lesson a day and has no AI. With no topic
 * of their own a person sees the built-in samples (`@/lib/learn/samples`).
 */
import {
  type LearnSampleTopic,
  SAMPLE_TOPICS,
  isSampleId,
} from "@/lib/learn/samples";
import {
  type LearnColor,
  type LearnIcon,
  type LearnLessonBody,
} from "@/lib/learn/schema";

export const LEARN_HREF = "/learn";
export const LEARN_NEW_HREF = "/learn/new";

/** Free: lessons a day (owner, 14.11.26). */
export const FREE_LESSONS_PER_DAY = 1;

export interface LearnLessonView {
  id: string;
  topicId: string;
  title: string;
  /** "AI", "Sample" or what a person typed. */
  source: string;
  minutes: number;
  status: "new" | "done";
  scheduledTaskId: string | null;
  completedAt: string | null;
  /** Present on a topic read, absent on the overview. */
  body?: LearnLessonBody;
}

export interface LearnTopicView {
  id: string;
  title: string;
  color: LearnColor;
  icon: LearnIcon | null;
  goal: string | null;
  level: string | null;
  sampleKey: string | null;
  /** A built-in sample, not the person's own. */
  sample: boolean;
  lessons: LearnLessonView[];
}

export interface LearnOverview {
  topics: LearnTopicView[];
  /** Lessons finished today in the person's zone, and the cap (null: none). */
  today: { completed: number; limit: number | null };
}

export const learnTopicHref = (topicId: string) =>
  `${LEARN_HREF}/${encodeURIComponent(topicId)}`;
export const learnLessonHref = (topicId: string, lessonId: string) =>
  `${learnTopicHref(topicId)}/${encodeURIComponent(lessonId)}`;

export function isLearnPath(pathname: string) {
  return pathname === LEARN_HREF || pathname.startsWith(`${LEARN_HREF}/`);
}

export interface LearnNavItem {
  href: string;
  label: string;
  /** Free: grey, with a PRO pill (Learn is Pro; Free gets a lesson a day). */
  locked: boolean;
}

/**
 * The row to draw, or null. Like Budget's: nothing until the plan is known,
 * so the PRO pill never flashes at someone who has paid.
 * //todo: a Settings switch to hide the row on Pro (`learnInSidebar`), as
 * Budget has; until then Pro always sees it.
 */
export function learnNavItem(args: {
  pro: boolean | undefined;
}): LearnNavItem | null {
  if (args.pro === undefined) return null;
  return { href: LEARN_HREF, label: "Learn", locked: args.pro === false };
}

/** A sample topic as the screens draw it. */
export function sampleTopicView(t: LearnSampleTopic): LearnTopicView {
  return {
    id: t.id,
    title: t.title,
    color: t.color,
    icon: t.icon,
    goal: t.goal,
    level: t.level,
    sampleKey: t.key,
    sample: true,
    lessons: t.lessons.map((l) => ({
      id: l.id,
      topicId: t.id,
      title: l.title,
      source: l.source,
      minutes: l.minutes,
      status: "new",
      scheduledTaskId: null,
      completedAt: null,
      body: l.body,
    })),
  };
}

export const SAMPLE_TOPIC_VIEWS: readonly LearnTopicView[] =
  SAMPLE_TOPICS.map(sampleTopicView);

/**
 * The topics to show: the person's own, or the samples while they have none.
 * `undefined` while loading.
 */
export function shownTopics(
  overview: LearnOverview | undefined
): readonly LearnTopicView[] | undefined {
  if (!overview) return undefined;
  return overview.topics.length ? overview.topics : SAMPLE_TOPIC_VIEWS;
}

/** A topic by id: the person's, else a sample. */
export function findTopic(
  overview: LearnOverview | undefined,
  topicId: string
): LearnTopicView | null {
  if (isSampleId(topicId))
    return SAMPLE_TOPIC_VIEWS.find((t) => t.id === topicId) ?? null;
  return overview?.topics.find((t) => t.id === topicId) ?? null;
}

/**
 * Whether opening this lesson is allowed today. Free has one a day: a lesson
 * already done, or any lesson before today's is used, opens; the next one
 * shows the promo instead, before the lesson starts, never in the middle of
 * it. Samples count like any lesson but are never stored.
 */
export function canOpenLesson(args: {
  pro: boolean;
  lesson: Pick<LearnLessonView, "status">;
  today: LearnOverview["today"] | undefined;
  /** Lessons opened earlier this session (samples are not stored). */
  openedToday?: number;
}): boolean {
  if (args.pro) return true;
  if (args.lesson.status === "done") return true;
  const limit = args.today?.limit ?? FREE_LESSONS_PER_DAY;
  const used = (args.today?.completed ?? 0) + (args.openedToday ?? 0);
  return used < limit;
}

export type LessonFilter = "all" | "new" | "done";

export function filterLessons(
  lessons: readonly LearnLessonView[],
  filter: LessonFilter
): LearnLessonView[] {
  if (filter === "all") return lessons.slice();
  return lessons.filter((l) => l.status === filter);
}

/** "AI · 6 min": the line under a lesson's title. */
export function lessonSourceLine(
  l: Pick<LearnLessonView, "source" | "minutes">
) {
  return `${l.source} · ${l.minutes} min`;
}

/** "4 lessons · 1 done" under a topic. */
export function topicCountLine(t: Pick<LearnTopicView, "lessons">) {
  const n = t.lessons.length;
  const done = t.lessons.filter((l) => l.status === "done").length;
  const base = `${n} ${n === 1 ? "lesson" : "lessons"}`;
  return done ? `${base} · ${done} done` : base;
}

/** The next lesson to do in a topic, else null. */
export function nextLesson(t: Pick<LearnTopicView, "lessons">) {
  return t.lessons.find((l) => l.status !== "done") ?? null;
}
