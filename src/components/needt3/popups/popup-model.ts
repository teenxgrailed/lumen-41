/**
 * The decisions behind the popups, with no React and no network: which
 * answers can be sent, who is asked for a review, and where a review goes.
 * The components render these; the logic chat's hooks call them.
 */

/** The four questions the feedback popup can ask. */
export type FeedbackKind = "rating" | "wish" | "friction" | "nps";

/** What a person answered. `score` is 1-5 for a rating and 0-10 for NPS. */
export interface FeedbackAnswer {
  kind: FeedbackKind;
  score?: number;
  text?: string;
}

export const RATING_SCALE: readonly number[] = [1, 2, 3, 4, 5];
export const NPS_SCALE: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** A written answer shorter than this is not sent (a stray key, not a thought). */
export const MIN_TEXT = 3;
export const MAX_TEXT = 2000;

export interface FeedbackCopy {
  title: string;
  hint: string;
  placeholder: string;
  /** The two ends of a scale, under its first and last point. */
  ends?: readonly [string, string];
  send: string;
}

export const FEEDBACK_COPY: Record<FeedbackKind, FeedbackCopy> = {
  rating: {
    title: "How is Needt working for you?",
    hint: "Pick a number, then tell us why if you like.",
    placeholder: "What made it that number? (optional)",
    ends: ["Not great", "Great"],
    send: "Send",
  },
  wish: {
    title: "What should we add?",
    hint: "One thing you wish Needt did. Plain words are fine.",
    placeholder: "I wish Needt could…",
    send: "Send",
  },
  friction: {
    title: "What's missing or annoying?",
    hint: "Something that slowed you down or was not there.",
    placeholder: "It was hard to…",
    send: "Send",
  },
  nps: {
    title: "How likely are you to recommend Needt?",
    hint: "To a friend or a colleague.",
    placeholder: "What is the main reason for your score? (optional)",
    ends: ["Not likely", "Very likely"],
    send: "Send",
  },
};

export function isScaleKind(kind: FeedbackKind) {
  return kind === "rating" || kind === "nps";
}

export function scaleFor(kind: FeedbackKind): readonly number[] {
  return kind === "nps" ? NPS_SCALE : kind === "rating" ? RATING_SCALE : [];
}

/** A scale question needs a pick; an open question needs some words. */
export function canSend(
  kind: FeedbackKind,
  score: number | null,
  text: string
): boolean {
  if (isScaleKind(kind)) {
    return score !== null && scaleFor(kind).includes(score);
  }
  const t = text.trim();
  return t.length >= MIN_TEXT && t.length <= MAX_TEXT;
}

/** The answer as the server receives it: trimmed, and no empty text. */
export function toAnswer(
  kind: FeedbackKind,
  score: number | null,
  text: string
): FeedbackAnswer {
  const t = text.trim().slice(0, MAX_TEXT);
  return {
    kind,
    ...(isScaleKind(kind) && score !== null ? { score } : {}),
    ...(t ? { text: t } : {}),
  };
}

export type NpsGroup = "detractor" | "passive" | "promoter";

export function npsGroup(score: number): NpsGroup {
  return score >= 9 ? "promoter" : score >= 7 ? "passive" : "detractor";
}

/**
 * Only someone who just said they like Needt is asked for a public review:
 * 4-5 of 5, or a promoter (9-10). Never after a wish or a complaint.
 */
export function asksForReview(answer: FeedbackAnswer): boolean {
  if (answer.score === undefined) return false;
  if (answer.kind === "rating") return answer.score >= 4;
  if (answer.kind === "nps") return npsGroup(answer.score) === "promoter";
  return false;
}

/** Where "leave a review" goes: the platform's own prompt, or a web page. */
export type ReviewRoute =
  | { kind: "native" }
  | { kind: "link"; href: string; label: string };

export const PRODUCT_HUNT_LABEL = "Review on Product Hunt";

/**
 * iOS and Mac (the shell has the native rating request): "native". Everywhere
 * else (the web): a link to Product Hunt. With neither, no review step.
 */
export function reviewRoute(env: {
  nativeRequest: boolean;
  productHuntUrl?: string | null;
}): ReviewRoute | null {
  if (env.nativeRequest) return { kind: "native" };
  const href = env.productHuntUrl?.trim();
  if (href && /^https:\/\//.test(href)) {
    return { kind: "link", href, label: PRODUCT_HUNT_LABEL };
  }
  return null;
}

/** The steps of one feedback popup, in order. */
export type FeedbackStep = "ask" | "thanks" | "review";

/** What comes after an answer is sent. */
export function stepAfterSend(
  answer: FeedbackAnswer,
  route: ReviewRoute | null
): FeedbackStep {
  return route && asksForReview(answer) ? "review" : "thanks";
}
