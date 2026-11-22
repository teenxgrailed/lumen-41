"use client";

import { useState } from "react";

import { useSearchParams } from "next/navigation";

import { FeedbackPopup } from "./FeedbackPopup";
import { UpsellPopup } from "./UpsellPopup";
import { WhatsNewPopup } from "./WhatsNewPopup";
import { limitCards, trialCards } from "./copy";
import {
  type FeedbackAnswer,
  type FeedbackKind,
  type FeedbackStep,
  reviewRoute,
} from "./popup-model";

/** What the lab can open, by the name `?s=` uses. */
export const LAB_SCENES = [
  ["whatsnew", "What's new"],
  ["upsell", "Limit reached"],
  ["trial", "Trial ending"],
  ["rating", "Rating 1-5"],
  ["wish", "What should we add?"],
  ["friction", "Missing or annoying"],
  ["nps", "NPS 0-10"],
  ["thanks", "Thanks"],
  ["review", "Leave a review?"],
] as const;

export type LabScene = (typeof LAB_SCENES)[number][0];

const noop = () => undefined;

const SAMPLE: Record<FeedbackKind, FeedbackAnswer> = {
  rating: {
    kind: "rating",
    score: 4,
    text: "The day plan saves me the morning shuffle.",
  },
  wish: { kind: "wish", text: "Let me share a habit streak with a friend." },
  friction: {
    kind: "friction",
    text: "Moving a task to tomorrow takes too many taps.",
  },
  nps: { kind: "nps", score: 9, text: "It fits the way I plan." },
};

export function PopupsLab() {
  const params = useSearchParams();
  const first = params.get("s");
  const native = params.get("native") === "1";
  /** ?pick=1: the question already answered, as it looks just before Send. */
  const picked = params.get("pick") === "1";
  const [scene, setScene] = useState<LabScene | null>(
    LAB_SCENES.some(([id]) => id === first) ? (first as LabScene) : null
  );
  const close = () => setScene(null);
  const route = reviewRoute({
    nativeRequest: native,
    productHuntUrl: "https://www.producthunt.com/products/needt",
  });

  const feedbackKind: FeedbackKind | null =
    scene === "rating" || scene === "wish" || scene === "friction"
      ? scene
      : scene === "nps" || scene === "thanks" || scene === "review"
        ? "nps"
        : null;
  const feedbackStep: FeedbackStep =
    scene === "thanks" ? "thanks" : scene === "review" ? "review" : "ask";

  return (
    <div className="pp-lab" data-testid="popups-lab">
      <h1 style={{ font: "600 15px/18px var(--font-sans)", margin: 0 }}>
        Popups lab
      </h1>
      <p
        style={{
          font: "400 13px/19px var(--font-sans)",
          color: "var(--text-tertiary)",
          margin: "8px 0 16px",
          maxWidth: 520,
        }}
      >
        Demo content only. Each button opens one popup; nothing is sent.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {LAB_SCENES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="btn btn-flat"
            onClick={() => setScene(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {scene === "whatsnew" ? (
        <WhatsNewPopup
          open
          onClose={close}
          title="Plan your day in one tap"
          body="Plan my day now reads your calendar and your habits together before it places anything."
          learnMore={{ label: "Learn more", href: "https://needt.app" }}
          items={[
            {
              glyph: "planday",
              text: "Tasks fit around meetings, travel time and focus blocks",
            },
            {
              glyph: "habits",
              text: "Habits keep their usual time unless something is in the way",
            },
            {
              glyph: "focus",
              text: "Start Focus from the plan and come back to where you were",
            },
          ]}
          primary={{ label: "Plan my day", onClick: close }}
          art={{ glyph: "planday" }}
        />
      ) : null}

      {scene === "upsell" ? (
        <UpsellPopup
          open
          onClose={close}
          dismissLabel="Not now"
          {...limitCards({
            limit: "3 habits",
            canTrial: true,
            onTrial: close,
            onPlans: close,
          })}
        />
      ) : null}
      {scene === "trial" ? (
        <UpsellPopup
          open
          onClose={close}
          dismissLabel="Remind me later"
          {...trialCards({ daysLeft: 3, onKeep: close, onStayFree: close })}
        />
      ) : null}

      {feedbackKind ? (
        <FeedbackPopup
          key={scene}
          open
          onClose={close}
          kind={feedbackKind}
          onSubmit={noop}
          review={route}
          onNativeReview={noop}
          initialStep={feedbackStep}
          initialAnswer={
            feedbackStep !== "ask"
              ? { kind: "nps", score: 10 }
              : picked
                ? SAMPLE[feedbackKind]
                : undefined
          }
        />
      ) : null}
    </div>
  );
}
