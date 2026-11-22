/**
 * Learn (openspec `module-blocks-and-learn`): the shapes
 * a topic and a lesson take, as Zod. Client-safe (no Prisma): the screens,
 * the samples, the REST routes and the AI's output all go through these, so
 * a lesson the model wrote and one a person typed are checked the same way.
 *
 * A lesson body is a short read with a few check questions after it:
 *   text    a paragraph to read (plain text, no markdown)
 *   choice  a question, 2 to 4 options, the index of the right one
 *   type    a question answered by typing; `answer` plus any `accept`
 *           spellings count as right (case and spacing do not matter)
 */
import { z } from "zod";

/** The washes a topic can wear: a key, never a colour value (see learn.css). */
export const LEARN_COLORS = [
  "violet",
  "plain",
  "amber",
  "green",
  "blue",
  "rose",
] as const;
export type LearnColor = (typeof LEARN_COLORS)[number];

/** The sticker glyphs a topic can wear (see `LearnGlyph`). */
export const LEARN_ICONS = [
  "language",
  "design",
  "money",
  "book",
  "code",
  "health",
  "music",
  "spark",
] as const;
export type LearnIcon = (typeof LEARN_ICONS)[number];

export const LEARN_LIMITS = {
  title: 80,
  goal: 280,
  level: 40,
  lessonTitle: 120,
  text: 1600,
  question: 240,
  option: 120,
  blocks: 16,
  /** Lessons one "Generate lessons" call writes. */
  generate: 5,
  /** Lessons a topic keeps. */
  lessonsPerTopic: 200,
  topics: 50,
} as const;

const clean = (max: number) => z.string().trim().min(1).max(max);

export const learnTextBlockSchema = z
  .object({ kind: z.literal("text"), text: clean(LEARN_LIMITS.text) })
  .strict();

export const learnChoiceBlockSchema = z
  .object({
    kind: z.literal("choice"),
    question: clean(LEARN_LIMITS.question),
    options: z.array(clean(LEARN_LIMITS.option)).min(2).max(4),
    answer: z.number().int().min(0).max(3),
  })
  .strict()
  .refine((b) => b.answer < b.options.length, {
    message: "answer must point at one of the options",
    path: ["answer"],
  });

export const learnTypeBlockSchema = z
  .object({
    kind: z.literal("type"),
    question: clean(LEARN_LIMITS.question),
    answer: clean(LEARN_LIMITS.option),
    accept: z.array(clean(LEARN_LIMITS.option)).max(6).optional(),
  })
  .strict();

export const learnBlockSchema = z.union([
  learnTextBlockSchema,
  learnChoiceBlockSchema,
  learnTypeBlockSchema,
]);
export type LearnBlock = z.infer<typeof learnBlockSchema>;

/** A lesson body: at least one thing to read. Questions are optional. */
export const learnLessonBodySchema = z
  .object({ blocks: z.array(learnBlockSchema).min(1).max(LEARN_LIMITS.blocks) })
  .strict()
  .refine((b) => b.blocks.some((x) => x.kind === "text"), {
    message: "a lesson needs something to read",
    path: ["blocks"],
  });
export type LearnLessonBody = z.infer<typeof learnLessonBodySchema>;

export const learnLessonDraftSchema = z
  .object({
    title: clean(LEARN_LIMITS.lessonTitle),
    minutes: z.number().int().min(1).max(60).default(5),
    body: learnLessonBodySchema,
  })
  .strict();
export type LearnLessonDraft = z.infer<typeof learnLessonDraftSchema>;

/** What the model must answer: `{ lessons: [...] }`, 1 to 5 of them. */
export const learnGeneratedSchema = z.object({
  lessons: z.array(learnLessonDraftSchema).min(1).max(LEARN_LIMITS.generate),
});

export const learnTopicInputSchema = z
  .object({
    title: clean(LEARN_LIMITS.title),
    color: z.enum(LEARN_COLORS).optional(),
    icon: z.enum(LEARN_ICONS).optional(),
    goal: z.string().trim().max(LEARN_LIMITS.goal).optional(),
    level: z.string().trim().max(LEARN_LIMITS.level).optional(),
  })
  .strict();
export type LearnTopicInput = z.infer<typeof learnTopicInputSchema>;

/** A topic change; `icon: null` clears the sticker. */
export const learnTopicPatchSchema = learnTopicInputSchema
  .partial()
  .extend({
    icon: z.enum(LEARN_ICONS).nullable().optional(),
    order: z.number().finite().optional(),
  })
  .strict();

export const learnLessonPatchSchema = z
  .object({ status: z.enum(["new", "done"]) })
  .strict();

/** A typed answer counts when it matches ignoring case, accents and spacing. */
export function typedAnswerMatches(
  block: Pick<z.infer<typeof learnTypeBlockSchema>, "answer" | "accept">,
  given: string
): boolean {
  const norm = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[.,!?;:'"«»„“”]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const g = norm(given);
  if (!g) return false;
  return [block.answer, ...(block.accept ?? [])].some((a) => norm(a) === g);
}

/** The questions in a body, in order. */
export function lessonQuestions(body: LearnLessonBody) {
  return body.blocks.filter((b) => b.kind !== "text");
}
