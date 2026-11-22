/**
 * Browser-side rules of the feedback popup (src/components/needt3/feedback).
 * Pure and storage-agnostic so they run in the Node-only Jest env.
 */
import type { FeedbackKind } from "@/services/feedback/eligibility";

export type { FeedbackKind };

/** Waits this long after the app loads before the popup may appear. */
export const PROMPT_DELAY_MS = 20_000;

const SESSION_KEY = "needt-feedback-prompted";

/** The slice of `sessionStorage` used here. */
export interface SessionStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

let promptedInMemory = false;

/**
 * "Never twice in one session": true once a prompt was shown in this browser
 * tab. `sessionStorage` carries it across a reload; the module flag covers a
 * browser where storage throws (private modes, blocked site data).
 */
export function promptedThisSession(store: SessionStore | null): boolean {
  if (promptedInMemory) return true;
  try {
    return store?.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPromptedThisSession(store: SessionStore | null): void {
  promptedInMemory = true;
  try {
    store?.setItem(SESSION_KEY, "1");
  } catch {
    // the module flag still holds for this page
  }
}

/** For tests. */
export function resetPromptedMemory(): void {
  promptedInMemory = false;
}

/**
 * The Product Hunt page people are sent to for a web review.
 * //todo: the product page is not live yet and no URL is in the repo (only
 * Product Hunt help articles, docs/launch/ph-submission.md). Set it when the
 * listing exists; until then the web build does not show the review step.
 */
export const PRODUCT_HUNT_REVIEW_URL: string | null = null;

export type ReviewChannel =
  | { kind: "native" }
  | { kind: "link"; url: string }
  | null;

/**
 * Where "Leave a review?" goes, or null to skip the step. The iOS app uses
 * the system rating prompt when its build has the bridge; the web and the
 * Windows desktop app link to Product Hunt when a URL is set. The Mac app has
 * no review bridge, so it skips the step (//todo with the Mac App Store
 * listing).
 */
export function reviewChannel(input: {
  platform: "web" | "ios" | "mac" | "desktop";
  nativeReviewAvailable: boolean;
  productHuntUrl?: string | null;
}): ReviewChannel {
  const url =
    input.productHuntUrl === undefined
      ? PRODUCT_HUNT_REVIEW_URL
      : input.productHuntUrl;
  if (input.platform === "ios")
    return input.nativeReviewAvailable ? { kind: "native" } : null;
  if (input.platform === "mac") return null;
  return url ? { kind: "link", url } : null;
}

/** What each kind asks, and what must be filled in before it can be sent. */
export const QUESTIONS: Record<
  FeedbackKind,
  { title: string; textLabel: string; textRequired: boolean }
> = {
  rating: {
    title: "How is Needt working for you?",
    textLabel: "Anything to add? (optional)",
    textRequired: false,
  },
  idea: {
    title: "What should we add?",
    textLabel: "Your idea",
    textRequired: true,
  },
  annoyance: {
    title: "What's missing or annoying?",
    textLabel: "What got in your way",
    textRequired: true,
  },
  nps: {
    title: "How likely are you to recommend Needt to a friend?",
    textLabel: "What is the main reason? (optional)",
    textRequired: false,
  },
};

/** Whether the form for `kind` holds a sendable answer. */
export function canSend(
  kind: FeedbackKind,
  value: { rating: number | null; score: number | null; text: string }
): boolean {
  if (kind === "rating") return value.rating !== null;
  if (kind === "nps") return value.score !== null;
  return value.text.trim().length > 0;
}
