import {
  SAMPLE_TOPICS,
  isSampleId,
  sampleLesson,
  sampleTopic,
} from "@/lib/learn/samples";
import {
  learnGeneratedSchema,
  learnLessonBodySchema,
  learnTopicInputSchema,
  lessonQuestions,
  typedAnswerMatches,
} from "@/lib/learn/schema";

describe("learn lesson body", () => {
  it("accepts reading with choice and typed questions", () => {
    const body = {
      blocks: [
        { kind: "text", text: "Weil sends the verb to the end." },
        {
          kind: "choice",
          question: "Which is right?",
          options: ["weil ich bin", "weil ich bin krank", "weil ich krank bin"],
          answer: 2,
        },
        { kind: "type", question: "Plural of Haus", answer: "Häuser" },
      ],
    };
    const parsed = learnLessonBodySchema.parse(body);
    expect(lessonQuestions(parsed)).toHaveLength(2);
  });

  it("needs something to read", () => {
    expect(
      learnLessonBodySchema.safeParse({
        blocks: [{ kind: "type", question: "Q", answer: "a" }],
      }).success
    ).toBe(false);
  });

  it("refuses an answer that points past the options", () => {
    expect(
      learnLessonBodySchema.safeParse({
        blocks: [
          { kind: "text", text: "x" },
          { kind: "choice", question: "Q", options: ["a", "b"], answer: 2 },
        ],
      }).success
    ).toBe(false);
  });

  it("refuses unknown block kinds and extra fields", () => {
    expect(
      learnLessonBodySchema.safeParse({
        blocks: [{ kind: "html", text: "<b>x</b>" }],
      }).success
    ).toBe(false);
    expect(
      learnLessonBodySchema.safeParse({
        blocks: [{ kind: "text", text: "x", script: "y" }],
      }).success
    ).toBe(false);
  });

  it("takes 1 to 5 generated lessons", () => {
    const one = {
      title: "Dativ",
      minutes: 5,
      body: { blocks: [{ kind: "text", text: "mit + Dativ" }] },
    };
    expect(learnGeneratedSchema.safeParse({ lessons: [one] }).success).toBe(
      true
    );
    expect(learnGeneratedSchema.safeParse({ lessons: [] }).success).toBe(false);
    expect(
      learnGeneratedSchema.safeParse({ lessons: Array(6).fill(one) }).success
    ).toBe(false);
  });
});

describe("typed answers", () => {
  const block = { answer: "der Lebenslauf", accept: ["Lebenslauf"] };
  it("ignores case, spacing, punctuation and accents", () => {
    expect(typedAnswerMatches(block, "  Der   lebenslauf. ")).toBe(true);
    expect(typedAnswerMatches(block, "lebenslauf")).toBe(true);
    expect(typedAnswerMatches({ answer: "Häuser" }, "hauser")).toBe(true);
  });
  it("refuses a wrong or empty answer", () => {
    expect(typedAnswerMatches(block, "die Bewerbung")).toBe(false);
    expect(typedAnswerMatches(block, "   ")).toBe(false);
  });
});

describe("topic input", () => {
  it("needs a title and keeps colours to the palette", () => {
    expect(learnTopicInputSchema.safeParse({ title: " " }).success).toBe(false);
    expect(
      learnTopicInputSchema.safeParse({ title: "Deutsch", color: "#ff0000" })
        .success
    ).toBe(false);
    expect(
      learnTopicInputSchema.parse({ title: " Deutsch ", color: "amber" })
    ).toEqual({ title: "Deutsch", color: "amber" });
  });
});

describe("sample topics", () => {
  it("are Deutsch, Design and Finance", () => {
    expect(SAMPLE_TOPICS.map((t) => t.title)).toEqual([
      "Deutsch",
      "Design",
      "Finance",
    ]);
  });

  it("every sample lesson passes the same schema as an AI lesson", () => {
    for (const topic of SAMPLE_TOPICS) {
      expect(topic.lessons.length).toBeGreaterThanOrEqual(3);
      expect(
        learnTopicInputSchema.safeParse({
          title: topic.title,
          color: topic.color,
          icon: topic.icon,
        }).success
      ).toBe(true);
      for (const lesson of topic.lessons) {
        const r = learnLessonBodySchema.safeParse(lesson.body);
        expect(r.success).toBe(true);
        expect(lesson.source).toBe("Sample");
      }
    }
  });

  it("have stable, unique, sample-marked ids", () => {
    const ids = SAMPLE_TOPICS.flatMap((t) => [
      t.id,
      ...t.lessons.map((l) => l.id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(isSampleId)).toBe(true);
    expect(sampleTopic("deutsch")?.id).toBe("sample-deutsch");
    expect(sampleTopic("sample-design")?.title).toBe("Design");
    expect(sampleLesson("sample-deutsch-1")?.lesson.title).toMatch(/weil/i);
    expect(sampleTopic("nope")).toBeNull();
  });
});
