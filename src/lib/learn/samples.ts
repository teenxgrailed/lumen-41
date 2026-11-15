/**
 * The sample topics Learn shows a person who has none yet: three topics with
 * finished lessons, so the place looks like itself before the first AI call.
 * Static, no AI, no account data. Marked as samples on screen; "Make it mine"
 * copies one into the person's own topics (`POST /api/learn/topics` with
 * `{ sample }`), after which the samples step aside.
 *
 * Ids are stable (`sample-<key>` and `sample-<key>-<n>`) so a link to a sample
 * lesson keeps working, and the design shots can open one by URL.
 */
import type { LearnColor, LearnIcon, LearnLessonDraft } from "./schema";

export interface LearnSampleLesson extends LearnLessonDraft {
  id: string;
  source: string;
}

export interface LearnSampleTopic {
  key: string;
  id: string;
  title: string;
  color: LearnColor;
  icon: LearnIcon;
  goal: string;
  level: string;
  lessons: LearnSampleLesson[];
}

export const SAMPLE_PREFIX = "sample-";

const lesson = (
  key: string,
  n: number,
  title: string,
  minutes: number,
  blocks: LearnLessonDraft["body"]["blocks"]
): LearnSampleLesson => ({
  id: `${SAMPLE_PREFIX}${key}-${n}`,
  title,
  minutes,
  source: "Sample",
  body: { blocks },
});

export const SAMPLE_TOPICS: readonly LearnSampleTopic[] = [
  {
    key: "deutsch",
    id: `${SAMPLE_PREFIX}deutsch`,
    title: "Deutsch",
    color: "violet",
    icon: "language",
    goal: "Get from A2 to B1: speak at the Gemeinde and at work",
    level: "A2",
    lessons: [
      lesson("deutsch", 1, "Weil and the verb at the end", 6, [
        {
          kind: "text",
          text: "After weil (because) the conjugated verb moves to the very end of the clause. Ich lerne Deutsch, weil ich in Zürich arbeite. The comma before weil is always there.",
        },
        {
          kind: "text",
          text: "Denn means the same but keeps normal word order: Ich lerne Deutsch, denn ich arbeite in Zürich. In speech weil is far more common, so train that one first.",
        },
        {
          kind: "choice",
          question: "Which sentence is right?",
          options: [
            "Ich bleibe zu Hause, weil ich bin krank.",
            "Ich bleibe zu Hause, weil ich krank bin.",
            "Ich bleibe zu Hause, weil bin ich krank.",
          ],
          answer: 1,
        },
        {
          kind: "type",
          question: "Finish: Ich komme später, weil ich noch … (arbeiten)",
          answer: "arbeite",
        },
      ]),
      lesson("deutsch", 2, "Dativ after mit, bei, nach", 5, [
        {
          kind: "text",
          text: "Mit, bei, nach, aus, von, zu, seit always take the dative. der and das become dem, die becomes der, plural die becomes den (+n on the noun).",
        },
        {
          kind: "choice",
          question: "Ich fahre mit … Zug.",
          options: ["der", "den", "dem"],
          answer: 2,
        },
        {
          kind: "type",
          question: "Ich wohne bei … Freundin. (die)",
          answer: "meiner",
          accept: ["der", "einer"],
        },
      ]),
      lesson("deutsch", 3, "Perfekt with sein or haben", 6, [
        {
          kind: "text",
          text: "Most verbs build the Perfekt with haben. Verbs of movement from A to B (gehen, fahren, fliegen) and of change of state (aufwachen, werden, sterben) take sein, and so do sein and bleiben.",
        },
        {
          kind: "choice",
          question: "Gestern … ich nach Bern gefahren.",
          options: ["habe", "bin"],
          answer: 1,
        },
        {
          kind: "choice",
          question: "Wir … den ganzen Tag gearbeitet.",
          options: ["haben", "sind"],
          answer: 0,
        },
      ]),
      lesson("deutsch", 4, "Words for the RAV meeting", 4, [
        {
          kind: "text",
          text: "die Bewerbung: the application. der Lebenslauf: the CV. die Stelle: the job opening. der Termin: the appointment. Ich habe drei Bewerbungen geschickt.",
        },
        {
          kind: "type",
          question: "German for the CV (with article)",
          answer: "der Lebenslauf",
          accept: ["Lebenslauf"],
        },
      ]),
    ],
  },
  {
    key: "design",
    id: `${SAMPLE_PREFIX}design`,
    title: "Design",
    color: "amber",
    icon: "design",
    goal: "Read a screen like a designer and say what is wrong with it",
    level: "Beginner",
    lessons: [
      lesson("design", 1, "One type scale, few sizes", 5, [
        {
          kind: "text",
          text: "A screen reads calm when it uses very few type sizes. Pick a body size, one smaller size for metadata and one display size for titles. Every extra size is a new decision the reader has to make.",
        },
        {
          kind: "choice",
          question:
            "A settings screen uses 12, 13, 14, 15 and 16px. What is the fix?",
          options: [
            "Add a 17px size for titles",
            "Collapse to two sizes and use weight for emphasis",
            "Make everything 14px",
          ],
          answer: 1,
        },
      ]),
      lesson("design", 2, "Greys from one colour", 4, [
        {
          kind: "text",
          text: "Instead of picking greys by eye, take the text colour and lower its opacity: 100, 85, 70, 55, 40, 25. They stay in tune on light and dark backgrounds because they are the same colour.",
        },
        {
          kind: "type",
          question: "What do you change to make a grey from the text colour?",
          answer: "opacity",
          accept: ["alpha", "the opacity", "the alpha", "transparency"],
        },
      ]),
      lesson("design", 3, "Depth without shadows", 5, [
        {
          kind: "text",
          text: "A one-pixel hairline plus a slightly different ground separates a card from its page. A shadow added to make something pop usually means the ground behind it is wrong.",
        },
        {
          kind: "choice",
          question:
            "A card does not stand out from the page. First thing to try?",
          options: [
            "A bigger drop shadow",
            "A hairline and a different ground",
            "A coloured border",
          ],
          answer: 1,
        },
      ]),
    ],
  },
  {
    key: "finance",
    id: `${SAMPLE_PREFIX}finance`,
    title: "Finance",
    color: "green",
    icon: "money",
    goal: "Know my margin on every resale before I buy",
    level: "Beginner",
    lessons: [
      lesson("finance", 1, "Landed cost", 6, [
        {
          kind: "text",
          text: "Landed cost is everything you pay to have the item in your hands: price, shipping, import duty, VAT and any fees. Your margin is sale price minus landed cost, not minus the sticker price.",
        },
        {
          kind: "choice",
          question: "Jacket 80, shipping 15, import fees 12. Landed cost?",
          options: ["80", "95", "107"],
          answer: 2,
        },
      ]),
      lesson("finance", 2, "Margin and markup", 5, [
        {
          kind: "text",
          text: "Markup compares profit with cost; margin compares profit with the sale price. Bought for 50, sold for 100: markup 100%, margin 50%. Platforms quote fees on the sale price, so think in margin.",
        },
        {
          kind: "type",
          question: "Bought for 60, sold for 100. Margin in %?",
          answer: "40",
          accept: ["40%", "40 %"],
        },
      ]),
      lesson("finance", 3, "Runway", 4, [
        {
          kind: "text",
          text: "Runway is how many months your cash lasts at the current monthly burn: cash divided by what you spend more than you earn each month.",
        },
        {
          kind: "choice",
          question: "Cash 3000, burn 600 a month. Runway?",
          options: ["3 months", "5 months", "6 months"],
          answer: 1,
        },
      ]),
    ],
  },
];

export function isSampleId(id: string) {
  return id.startsWith(SAMPLE_PREFIX);
}

export function sampleTopic(idOrKey: string): LearnSampleTopic | null {
  return (
    SAMPLE_TOPICS.find((t) => t.id === idOrKey || t.key === idOrKey) ?? null
  );
}

export function sampleLesson(id: string) {
  for (const topic of SAMPLE_TOPICS) {
    const found = topic.lessons.find((l) => l.id === id);
    if (found) return { topic, lesson: found };
  }
  return null;
}
