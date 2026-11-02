/**
 * The email categories of the programme (openspec add-email-program).
 *
 * `transactional` mail is about the person's own account (verify, reset,
 * receipts, export, welcome, gift notice, reminders they set) and is never
 * optional. The rest is optional: sent only while the category is on, with a
 * one-click unsubscribe. The test for a new mail: if it names a price, a plan
 * or a feature the person has not used, it is optional.
 */
export const OPTIONAL_CATEGORIES = [
  "tips",
  "offers",
  "updates",
  "recap",
] as const;
export type OptionalCategory = (typeof OPTIONAL_CATEGORIES)[number];

export type EmailCategory = "transactional" | OptionalCategory | "digest";

/** Soft opt-in for the first three (owner decision 4); recap is opt-in. */
export const CATEGORY_DEFAULTS: Record<OptionalCategory, boolean> = {
  tips: true,
  offers: true,
  updates: true,
  recap: false,
};

/** What a person sees on the preference page. */
export const CATEGORY_COPY: Record<
  OptionalCategory,
  { label: string; description: string }
> = {
  tips: {
    label: "Tips",
    description: "A few short mails in your first weeks about one step at a time.",
  },
  offers: {
    label: "Offers",
    description: "Your trial ending, and an occasional offer.",
  },
  updates: {
    label: "Updates",
    description: "What is new in Needt, written by us, rarely.",
  },
  recap: {
    label: "Monthly recap",
    description: "Your month in Needt, only when there is something to show.",
  },
};

export function isOptionalCategory(value: unknown): value is OptionalCategory {
  return (
    typeof value === "string" &&
    (OPTIONAL_CATEGORIES as readonly string[]).includes(value)
  );
}

/** Categories the legacy `commercialEmailsOptOutAt` column switched off. */
export const LEGACY_OPT_OUT_CATEGORIES: readonly OptionalCategory[] = [
  "tips",
  "offers",
  "updates",
];

/** Where a preference came from, for consent history. */
export type PreferenceSource =
  | "default"
  | "legacy"
  | "settings"
  | "unsubscribe-link"
  | "complaint"
  | "sunset"
  | "admin";

/**
 * Mails that count towards the global cap: any optional category except the
 * digest. (The digest is not a category of this programme and is never
 * capped.)
 */
export function countsTowardsCap(category: EmailCategory): boolean {
  return category !== "transactional" && category !== "digest";
}
