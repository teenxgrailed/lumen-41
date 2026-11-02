import { APP_NAME } from "@/lib/app-config";

import { type EmailFooter, type RenderedEmail, renderEmail } from "./layout";

/**
 * The mails of the email programme (openspec add-email-program). One voice:
 * Needt, never a named person. Each mail has one idea and at most one button,
 * and every lifecycle body is 90 words or fewer (a test enforces it). Optional
 * mail carries the unsubscribe link and the owner's name and address.
 *
 * Nothing here guilts anyone about an absence.
 */

export type LifecycleBase = {
  /** First name or "there". */
  name?: string | null;
  appUrl: string;
  unsubscribeUrl: string;
  footer: EmailFooter;
};

const hello = (name?: string | null) => `Hi ${name?.trim() || "there"},`;

function optional(
  base: LifecycleBase,
  content: {
    subject: string;
    preheader: string;
    heading: string;
    paragraphs: string[];
    button?: { label: string; url: string };
  }
): RenderedEmail {
  return renderEmail({
    ...content,
    kind: "commercial",
    unsubscribeUrl: base.unsubscribeUrl,
    footer: base.footer,
  });
}

const at = (base: LifecycleBase, path: string) =>
  `${base.appUrl.replace(/\/+$/, "")}${path}`;

/** "5 February 2027", in UTC so a preview and a send agree. */
export function longDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function getOnboardDay2Template(base: LifecycleBase) {
  return optional(base, {
    subject: "Connect a calendar and Needt can plan around it",
    preheader: "One step, about a minute.",
    heading: "One step: connect a calendar",
    paragraphs: [
      hello(base.name),
      "Needt plans your tasks around the events you already have. Connect Google, Outlook or any CalDAV calendar and it sees where your free time is.",
      "It takes about a minute, and you can disconnect it whenever you like.",
    ],
    button: { label: "Connect a calendar", url: at(base, "/settings") },
  });
}

export function getOnboardDay5Template(base: LifecycleBase) {
  return optional(base, {
    subject: "Plan one day in Needt",
    preheader: "Add a few tasks and let Needt find the time.",
    heading: "One step: plan a day",
    paragraphs: [
      hello(base.name),
      "Add the three things you want done today and let Needt place them on your calendar. You can move any of them by hand afterwards.",
    ],
    button: { label: "Plan today", url: at(base, "/today") },
  });
}

export function getOnboardDay9Template(base: LifecycleBase) {
  return optional(base, {
    subject: "Turn one habit into time on your calendar",
    preheader: "Free keeps up to 3 habits.",
    heading: "One step: add a habit",
    paragraphs: [
      hello(base.name),
      "A habit is something you want to do a few times a week. Needt finds a slot for it each week and keeps it out of the way of your meetings.",
      "Free includes up to 3 habits.",
    ],
    button: { label: "Add a habit", url: at(base, "/habits") },
  });
}

export function getTrialEnding3dTemplate(
  base: LifecycleBase & { endsAt: Date; priceLine?: string }
) {
  return optional(base, {
    subject: "Your Pro trial ends in 3 days",
    preheader: `It ends on ${longDate(base.endsAt)}.`,
    heading: "Your Pro trial ends in 3 days",
    paragraphs: [
      hello(base.name),
      `Your ${APP_NAME} Pro trial ends on ${longDate(base.endsAt)}. After that your account moves to Free, and everything you made stays where it is.`,
      base.priceLine ??
        "Pro is $7 a month. The early $7 price is still open.",
    ],
    button: { label: "Choose Pro", url: at(base, "/settings#billing") },
  });
}

/**
 * The morning the trial ends. With a Creem code in System Settings it offers
 * 20% off the first year; without one it repeats the early-price line. Never
 * shows an empty or placeholder code.
 */
export function getTrialEnding0dTemplate(
  base: LifecycleBase & { promoCode: string | null }
) {
  const promo = base.promoCode?.trim() || null;
  return optional(base, {
    subject: "Your Pro trial ends today",
    preheader: promo
      ? "20% off your first year, if you want to keep Pro."
      : "Your data stays either way.",
    heading: "Your Pro trial ends today",
    paragraphs: [
      hello(base.name),
      "Your Pro trial ends today. If you do nothing, your account moves to Free and everything you made stays where it is.",
      promo
        ? `If you would like to keep Pro, use the code ${promo} at checkout for 20% off your first year.`
        : "If you would like to keep Pro, it is $7 a month, and the early $7 price is still open.",
    ],
    button: { label: "Choose Pro", url: at(base, "/settings#billing") },
  });
}

export function getWinback14Template(base: LifecycleBase) {
  return optional(base, {
    subject: "What got in the way?",
    preheader: "Reply to this email; it reaches us.",
    heading: "What got in the way?",
    paragraphs: [
      hello(base.name),
      `It has been a couple of weeks since you opened ${APP_NAME}. If something did not fit, we would like to know what. Reply to this email with a line or two; it reaches us.`,
    ],
    button: { label: `Open ${APP_NAME}`, url: at(base, "/today") },
  });
}

export function getWinback30Template(base: LifecycleBase) {
  return optional(base, {
    subject: `A lot has changed in ${APP_NAME}`,
    preheader: "If it was missing something, tell us.",
    heading: `Things have changed in ${APP_NAME}`,
    paragraphs: [
      hello(base.name),
      `We ship every week. If ${APP_NAME} was missing something for you a month ago, it may be there now. And if it still is, reply and tell us what; we read every answer.`,
    ],
    button: { label: `Open ${APP_NAME}`, url: at(base, "/today") },
  });
}

export function getStillWantTemplate(
  base: LifecycleBase & { keepUrl: string }
) {
  return optional(base, {
    subject: "Do you still want these emails?",
    preheader: "One button keeps them. Otherwise they stop.",
    heading: "Do you still want these emails?",
    paragraphs: [
      hello(base.name),
      `You have not opened ${APP_NAME} for a while, so we ask once in a while. Press the button to keep getting our emails. If you do nothing, they stop in two weeks. Mail about your account and security keeps arriving either way.`,
    ],
    button: { label: "Keep them", url: base.keepUrl },
  });
}

export type RecapInput = LifecycleBase & {
  monthLabel: string;
  tasksCompleted: number | null;
  habitCheckIns: number | null;
  previousTasksCompleted: number | null;
};

/** One line, from fixed wording, comparing with the month before. */
export function recapObservation(input: {
  tasksCompleted: number | null;
  previousTasksCompleted: number | null;
}): string | null {
  const { tasksCompleted: now, previousTasksCompleted: before } = input;
  if (now === null || before === null || before <= 0) return null;
  if (now > before) return `That is ${now - before} more than the month before.`;
  if (now < before) return `The month before it was ${before}.`;
  return "The same as the month before.";
}

/** The designed mail of the set: real numbers or nothing. */
export function getRecapTemplate(input: RecapInput) {
  const lines: string[] = [];
  if (input.tasksCompleted !== null) {
    lines.push(`Tasks completed: ${input.tasksCompleted}`);
  }
  if (input.habitCheckIns !== null) {
    lines.push(`Habit check-ins: ${input.habitCheckIns}`);
  }
  const observation = recapObservation(input);
  return optional(input, {
    subject: `Your ${input.monthLabel} in ${APP_NAME}`,
    preheader: lines.join(". "),
    heading: `Your ${input.monthLabel} in ${APP_NAME}`,
    paragraphs: [
      hello(input.name),
      ...lines,
      ...(observation ? [observation] : []),
    ],
    button: { label: `Open ${APP_NAME}`, url: at(input, "/today") },
  });
}

/**
 * The gift notice. Transactional: it reports a change to the account, names
 * no price and carries no unsubscribe link.
 */
export function getGiftTemplate(input: {
  name?: string | null;
  appUrl: string;
  months: number;
  endsAt: Date;
  personalNote: string | null;
  footer?: EmailFooter | null;
}) {
  const length =
    input.months === 12
      ? "a year"
      : input.months === 1
        ? "1 month"
        : `${input.months} months`;
  const note = input.personalNote?.trim();
  return renderEmail({
    subject: `You've got a gift from ${APP_NAME}`,
    preheader: `${length} of Pro, from us.`,
    heading: `You've got a gift from ${APP_NAME}`,
    paragraphs: [
      hello(input.name),
      `We gave you ${length} of ${APP_NAME} Pro, until ${longDate(input.endsAt)}.`,
      ...(note ? [note] : []),
      "No card, nothing to cancel.",
    ],
    button: {
      label: "Start using Pro",
      url: `${input.appUrl.replace(/\/+$/, "")}/today?gift=1`,
    },
    kind: "security",
    footer: input.footer,
  });
}

export type BroadcastInput = LifecycleBase & {
  subject: string;
  preheader: string;
  paragraphs: string[];
  button?: { label: string; url: string } | null;
};

/** A broadcast Claude or the owner wrote: plain paragraphs and one button. */
export function getBroadcastTemplate(input: BroadcastInput) {
  return optional(input, {
    subject: input.subject,
    preheader: input.preheader || input.subject,
    heading: input.subject,
    paragraphs: input.paragraphs,
    button: input.button ?? undefined,
  });
}
