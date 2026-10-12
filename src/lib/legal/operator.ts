/**
 * The facts about the operator that the Privacy Notice, the Terms and the
 * subprocessor list print. Every value that changes when the owner signs
 * something lives here, so a change is one line.
 *
 * DATAREP_CONTACT is still a placeholder. Until it is filled, the pages print
 * interim wording instead of the raw placeholder, and a skipped test in
 * `src/lib/legal/__tests__/documents.test.ts` names it. Fill it, then un-skip
 * that test.
 */

/** The operator's full legal name (owner, 2026-10-12): a private individual. */
export const OPERATOR_FULL_NAME = "Maksym Antoniuk";

/**
 * The EU representative's contact (GDPR Art. 27): entity name, postal address
 * and the email or web form DataRep assigns to Needt, as one line.
 */
export const DATAREP_CONTACT = "{{DATAREP_CONTACT}}";

/** Printed while OPERATOR_FULL_NAME is unfilled. */
export const OPERATOR_SHORT_NAME = "Maksym A.";

export const OPERATOR_COUNTRY = "Ukraine";
export const PRIVACY_EMAIL = "privacy@needt.app";
export const SUPPORT_EMAIL = "support@needt.app";

/**
 * Effective date of the Privacy Notice, the Terms and the subprocessor list,
 * as YYYY-MM-DD. Set it to the day the publishing change is merged.
 */
export const LEGAL_EFFECTIVE_DATE = "2026-10-12";

const PLACEHOLDER = /^\{\{[A-Z_]+\}\}$/;

export function isUnfilled(value: string): boolean {
  return PLACEHOLDER.test(value.trim());
}

/** The constants that must be replaced before the documents are final. */
export const LEGAL_PLACEHOLDERS = {
  OPERATOR_FULL_NAME,
  DATAREP_CONTACT,
} as const;

export function operatorName(): string {
  return isUnfilled(OPERATOR_FULL_NAME)
    ? OPERATOR_SHORT_NAME
    : OPERATOR_FULL_NAME;
}

/** The DataRep contact, or null while the agreement is not yet signed. */
export function eu27Representative(): string | null {
  return isUnfilled(DATAREP_CONTACT) ? null : DATAREP_CONTACT;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "2026-10-12" → "12 October 2026", without a Date or a time zone. */
export function formatLegalDate(ymd: string = LEGAL_EFFECTIVE_DATE): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) throw new Error(`Not a YYYY-MM-DD date: ${ymd}`);
  const [, year, month, day] = match;
  const name = MONTHS[Number(month) - 1];
  if (!name) throw new Error(`Not a month: ${month}`);
  return `${Number(day)} ${name} ${year}`;
}
