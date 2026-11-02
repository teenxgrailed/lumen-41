import { CATALOG_FOOTER } from "./catalog";
import type { EmailFooter, RenderedEmail } from "./layout";
import {
  getBroadcastTemplate,
  getGiftTemplate,
  getOnboardDay2Template,
  getOnboardDay5Template,
  getOnboardDay9Template,
  getRecapTemplate,
  getStillWantTemplate,
  getTrialEnding0dTemplate,
  getTrialEnding3dTemplate,
  getWinback14Template,
  getWinback30Template,
} from "./lifecycle";

export type LifecycleSample = {
  key: string;
  label: string;
  /** `optional` carries an unsubscribe link and the operator footer. */
  kind: "optional" | "transactional";
  email: RenderedEmail;
};

const APP = "https://use.needt.app";
const UNSUBSCRIBE = `${APP}/api/email/unsubscribe?t=SAMPLE`;

/**
 * Every email of the programme with fixed sample data, for the admin preview
 * and the tests. Plainly example text, never a bracketed placeholder.
 */
export function lifecycleSamples(
  footer: EmailFooter = CATALOG_FOOTER
): LifecycleSample[] {
  const base = {
    name: "Alex",
    appUrl: APP,
    unsubscribeUrl: UNSUBSCRIBE,
    footer,
  };
  const endsAt = new Date("2026-12-05T12:00:00.000Z");
  const optional = (key: string, label: string, email: RenderedEmail) => ({
    key,
    label,
    kind: "optional" as const,
    email,
  });
  return [
    optional("onboard-day2", "Onboarding, day 2", getOnboardDay2Template(base)),
    optional("onboard-day5", "Onboarding, day 5", getOnboardDay5Template(base)),
    optional("onboard-day9", "Onboarding, day 9", getOnboardDay9Template(base)),
    optional(
      "trial-ending-3d",
      "Trial ends in 3 days",
      getTrialEnding3dTemplate({ ...base, endsAt })
    ),
    optional(
      "trial-ending-0d",
      "Trial ends today, with a code",
      getTrialEnding0dTemplate({ ...base, promoCode: "EXAMPLE20" })
    ),
    optional(
      "trial-ending-0d-nocode",
      "Trial ends today, no code",
      getTrialEnding0dTemplate({ ...base, promoCode: null })
    ),
    optional("winback-14d", "Win-back, 14 days", getWinback14Template(base)),
    optional("winback-30d", "Win-back, 30 days", getWinback30Template(base)),
    optional(
      "still-want",
      "Do you still want these?",
      getStillWantTemplate({
        ...base,
        keepUrl: `${APP}/api/email/preferences?keep=1&t=SAMPLE`,
      })
    ),
    optional(
      "recap-monthly",
      "Monthly recap",
      getRecapTemplate({
        ...base,
        monthLabel: "October",
        tasksCompleted: 24,
        habitCheckIns: 31,
        previousTasksCompleted: 18,
      })
    ),
    optional(
      "broadcast",
      "Broadcast (sample)",
      getBroadcastTemplate({
        ...base,
        subject: "What is new this month",
        preheader: "Two things changed.",
        paragraphs: [
          "Hi Alex,",
          "Mail now shows next to your tasks.",
          "That is all for this month.",
        ],
        button: { label: "Open Needt", url: `${APP}/today` },
      })
    ),
    {
      key: "gift",
      label: "Gift of Pro",
      kind: "transactional",
      email: getGiftTemplate({
        name: "Alex",
        appUrl: APP,
        months: 3,
        endsAt,
        personalNote: "Thank you for the feedback on the calendar.",
        footer,
      }),
    },
  ];
}
