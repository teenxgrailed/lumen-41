import type { EmailCategory } from "@/lib/email/categories";
import type { EmailPreferences } from "@/lib/email/preferences";

export type RuleKey =
  | "onboard-day2"
  | "onboard-day5"
  | "onboard-day9"
  | "trial-ending-3d"
  | "trial-ending-0d"
  | "winback-14d"
  | "winback-30d"
  | "still-want"
  | "recap-monthly"
  | "gift";

/** What the engine knows about one person when it decides. */
export type Person = {
  userId: string;
  email: string | null;
  name: string | null;
  verifiedAt: Date | null;
  createdAt: Date | null;
  lastActiveAt: Date | null;
  sandbox: boolean;
  deleting: boolean;
  /** The stored zone; may be invalid (UTC is used then). */
  timeZone: string;
  /** `NotificationSettings` quiet hours, when switched on. */
  quiet: { startMinute: number; endMinute: number } | null;
  preferences: EmailPreferences;
  suppressed: boolean;
  /** The flag `email_program` is on for this person. */
  flagOn: boolean;
  /** On a paid plan that is not a gift (payment-linked or lifetime). */
  paid: boolean;
  trial: {
    startedAt: Date;
    endsAt: Date;
    /** The old sender already mailed the 3-day notice. */
    legacyThreeDaySentAt: Date | null;
  } | null;
  /** An active Pro gift, when there is one. */
  gift: { endsAt: Date } | null;
  facts: {
    connectedCalendar: boolean;
    taskCount: number;
    scheduledTaskCount: number;
    /** Completed tasks plus habit completions last month, for the recap. */
    lastMonthActivity: number;
  };
  /** Most recent optional mail that counts towards the cap. */
  lastMarketingSentAt: Date | null;
};

/** Extra input for a rule that is about one thing (a gift). */
export type RuleContext = {
  gift?: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    revoked: boolean;
  };
};

export type Rule = {
  key: RuleKey;
  category: EmailCategory;
  /** Lower number wins when two rules are due together. */
  priority: number;
  /** Ignores the global cap and does not count towards it. */
  exempt: boolean;
  window: "standard" | "gift";
  /** Sent on Saturday and Sunday too (trial ending). */
  weekends: boolean;
  /** When the rule becomes due for this person, or null if never. */
  dueAt(person: Person, ctx: RuleContext, now: Date): Date | null;
  /** After this the mail no longer makes sense and is dropped as stale. */
  expiresAt(person: Person, due: Date, ctx: RuleContext): Date;
  /** A reason to skip for good, or null. */
  skip(person: Person, now: Date, ctx: RuleContext): string | null;
  /** Distinguishes repeats of the same rule (month, lapse, gift id). */
  dedupeKey(person: Person, ctx: RuleContext, now: Date): string;
};

export type Decision =
  /** Not due yet (or never for this person): nothing to record. */
  | { kind: "wait" }
  | { kind: "send" }
  /** `record: false` leaves no ledger row (flag off, operator unresolved). */
  | { kind: "skip"; reason: string; record: boolean }
  | { kind: "defer"; until: Date; reason: "cap" | "window" };

export type ExistingSend = {
  status: string;
  deferUntil: Date | null;
} | null;
