import {
  FEEDBACK_KINDS,
  type FeedbackUser,
  earnsReviewStep,
  nextFeedbackPrompt,
} from "../eligibility";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-22T12:00:00.000Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

const veteran: FeedbackUser = {
  createdAt: ago(90),
  feedbackPrompts: true,
  onboardingDone: true,
};
const active = { activeDays: 5 };

describe("nextFeedbackPrompt", () => {
  it("asks an active, established person who was never asked, starting with the rating", () => {
    expect(nextFeedbackPrompt(veteran, [], active, NOW)).toBe("rating");
  });

  it("leaves a new account alone for 7 days, then allows it", () => {
    const fresh = { ...veteran, createdAt: ago(6.9) };
    expect(nextFeedbackPrompt(fresh, [], active, NOW)).toBeNull();
    const week = { ...veteran, createdAt: ago(7) };
    expect(nextFeedbackPrompt(week, [], active, NOW)).toBe("rating");
  });

  it("does not gate an account with no creation date", () => {
    expect(
      nextFeedbackPrompt({ ...veteran, createdAt: null }, [], active, NOW)
    ).toBe("rating");
  });

  it("needs 5 distinct active days in the last 14", () => {
    expect(nextFeedbackPrompt(veteran, [], { activeDays: 4 }, NOW)).toBeNull();
    expect(nextFeedbackPrompt(veteran, [], { activeDays: 0 }, NOW)).toBeNull();
    expect(nextFeedbackPrompt(veteran, [], { activeDays: 5 }, NOW)).toBe(
      "rating"
    );
  });

  it("is silent during onboarding and when the person switched it off", () => {
    expect(
      nextFeedbackPrompt({ ...veteran, onboardingDone: false }, [], active, NOW)
    ).toBeNull();
    expect(
      nextFeedbackPrompt(
        { ...veteran, feedbackPrompts: false },
        [],
        active,
        NOW
      )
    ).toBeNull();
  });

  it("keeps 14 days between two prompts", () => {
    const shown = (days: number) => [{ kind: "rating", shownAt: ago(days) }];
    expect(nextFeedbackPrompt(veteran, shown(13.9), active, NOW)).toBeNull();
    expect(nextFeedbackPrompt(veteran, shown(1), active, NOW)).toBeNull();
    expect(nextFeedbackPrompt(veteran, shown(14), active, NOW)).toBe("idea");
  });

  it("counts a dismissed prompt as shown: it spaces the next and rotates past its kind", () => {
    // History rows carry no answered/dismissed flag on purpose: every row is a
    // shown prompt, whatever came of it.
    const history = [{ kind: "rating", shownAt: ago(2) }];
    expect(nextFeedbackPrompt(veteran, history, active, NOW)).toBeNull();
    const later = [{ kind: "rating", shownAt: ago(15) }];
    expect(nextFeedbackPrompt(veteran, later, active, NOW)).toBe("idea");
  });

  it("rotates rating, idea, annoyance, nps and starts over", () => {
    const order: string[] = [];
    const history: { kind: string; shownAt: Date }[] = [];
    for (let i = 0; i < 6; i += 1) {
      const at = new Date(NOW.getTime() + i * 15 * DAY);
      const kind = nextFeedbackPrompt(veteran, history, active, at);
      expect(kind).not.toBeNull();
      order.push(kind as string);
      history.push({ kind: kind as string, shownAt: at });
    }
    expect(order).toEqual([
      "rating",
      "idea",
      "annoyance",
      "nps",
      "rating",
      "idea",
    ]);
    expect(order.slice(0, 4)).toEqual([...FEEDBACK_KINDS]);
  });

  it("prefers the kind shown longest ago, never one already shown over one never shown", () => {
    const history = [
      { kind: "idea", shownAt: ago(40) },
      { kind: "nps", shownAt: ago(30) },
    ];
    // rating and annoyance were never shown: the first in list order wins
    expect(nextFeedbackPrompt(veteran, history, active, NOW)).toBe("rating");
  });
});

describe("earnsReviewStep", () => {
  it("is earned by a 5 out of 5", () => {
    expect(earnsReviewStep("rating", { rating: 5 })).toBe(true);
    expect(earnsReviewStep("rating", { rating: 4 })).toBe(false);
    expect(earnsReviewStep("rating", { rating: 1 })).toBe(false);
  });

  it("is earned by an NPS of 9 or 10 only", () => {
    expect(earnsReviewStep("nps", { score: 10 })).toBe(true);
    expect(earnsReviewStep("nps", { score: 9 })).toBe(true);
    expect(earnsReviewStep("nps", { score: 8 })).toBe(false);
    expect(earnsReviewStep("nps", { score: 0 })).toBe(false);
  });

  it("is never earned by the free-text kinds, whatever they carry", () => {
    expect(earnsReviewStep("idea", { rating: 5, score: 10 })).toBe(false);
    expect(earnsReviewStep("annoyance", { rating: 5, score: 10 })).toBe(false);
  });
});
