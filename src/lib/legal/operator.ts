/**
 * The facts about the operator that the Privacy Notice, the Terms and the
 * subprocessor list print. Every value that changes when the owner signs
 * something lives here, so a change is one line.
 */

/**
 * The operator's full legal name: a Ukrainian individual entrepreneur
 * (FOP, 3rd group, registered 2026-11-02 via Diia). Spelling as on the
 * EDR extract; the owner confirms it before merge.
 */
export const OPERATOR_FULL_NAME = "Nataliia Antoniuk";

/** The legal form printed next to the name. */
export const OPERATOR_LEGAL_FORM =
  "individual entrepreneur (FOP) registered in Ukraine";

/** Printed while OPERATOR_FULL_NAME is unfilled. */
export const OPERATOR_SHORT_NAME = "Nataliia A.";

export const OPERATOR_COUNTRY = "Ukraine";
export const PRIVACY_EMAIL = "privacy@needt.app";
export const SUPPORT_EMAIL = "support@needt.app";

/**
 * Effective date of the Privacy Notice, the Terms and the subprocessor list,
 * as YYYY-MM-DD. Set it to the day the publishing change is merged.
 */
//todo: DRAFT value (App Store terms, PR not for merging yet). Set it to the
// day this change is merged: checkout records it as the terms version.
export const LEGAL_EFFECTIVE_DATE = "2026-11-04";

const PLACEHOLDER = /^\{\{[A-Z_]+\}\}$/;

export function isUnfilled(value: string): boolean {
  return PLACEHOLDER.test(value.trim());
}

/** The constants that must be replaced before the documents are final. */
export const LEGAL_PLACEHOLDERS = {
  OPERATOR_FULL_NAME,
} as const;

export function operatorName(): string {
  return isUnfilled(OPERATOR_FULL_NAME)
    ? OPERATOR_SHORT_NAME
    : OPERATOR_FULL_NAME;
}

/**
 * The operator's postal address, one line, from `OPERATOR_POSTAL_ADDRESS`
 * (the owner sets it; it is never invented here). Commercial email carries it
 * (CAN-SPAM and similar rules ask for a postal address), and while it is unset
 * no commercial email is sent (src/lib/email/email-service.ts). The older
 * `EMAIL_FOOTER_ADDRESS` still works as a fallback.
 */
export function operatorPostalAddress(): string | null {
  const value =
    process.env.OPERATOR_POSTAL_ADDRESS?.trim() ||
    process.env.EMAIL_FOOTER_ADDRESS?.trim() ||
    "";
  return value && !isUnfilled(value) ? value : null;
}

/**
 * The US Copyright Office registration number of the designated DMCA agent
 * (`DMCA_AGENT_REG_NO`, e.g. "DMCA-1234567"), or null until the owner has
 * registered. The Terms print their DMCA agent line only when it is set.
 */
export function dmcaAgentRegistrationNumber(): string | null {
  const value = process.env.DMCA_AGENT_REG_NO?.trim() ?? "";
  return value && !isUnfilled(value) ? value : null;
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
