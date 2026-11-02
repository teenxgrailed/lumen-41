import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

/**
 * The four values the owner sets in admin System Settings for the email
 * programme (openspec add-email-program, owner decisions 1, 2 and 9). Read
 * from the database on each use; nothing is hard-coded and nothing falls back
 * to a placeholder.
 */

export type OperatorFooter = { name: string; address: string };

export type EmailProgramSettings = {
  footer: OperatorFooter | null;
  /** Which footer values are missing, for the admin banner. */
  footerMissing: Array<"name" | "address">;
  promoCode: string | null;
  trackingEndsAt: Date | null;
};

const PLACEHOLDER = /\[OWNER|\{\{|\}\}/;

/** A usable value: non-blank, one line, no placeholder text. */
export function cleanSetting(value: string | null | undefined): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text || PLACEHOLDER.test(text)) return null;
  return text;
}

export function buildProgramSettings(
  row: {
    emailFooterName?: string | null;
    emailFooterAddress?: string | null;
    emailTrialPromoCode?: string | null;
    emailTrackingEndsAt?: Date | null;
  } | null
): EmailProgramSettings {
  const name = cleanSetting(row?.emailFooterName);
  const address = cleanSetting(row?.emailFooterAddress);
  const footerMissing: Array<"name" | "address"> = [];
  if (!name) footerMissing.push("name");
  if (!address) footerMissing.push("address");
  return {
    footer: name && address ? { name, address } : null,
    footerMissing,
    promoCode: cleanSetting(row?.emailTrialPromoCode),
    trackingEndsAt: row?.emailTrackingEndsAt ?? null,
  };
}

export async function getEmailProgramSettings(): Promise<EmailProgramSettings> {
  const row = await prisma.systemSettings.findFirst({
    select: {
      emailFooterName: true,
      emailFooterAddress: true,
      emailTrialPromoCode: true,
      emailTrackingEndsAt: true,
    },
  });
  return buildProgramSettings(row);
}

/** The footer of optional mail, or null while either value is unset. */
export async function resolveOperatorFooter(): Promise<OperatorFooter | null> {
  return (await getEmailProgramSettings()).footer;
}

/** Open and click tracking is on until the date in System Settings. */
export function trackingActive(
  settings: Pick<EmailProgramSettings, "trackingEndsAt">,
  now: Date
): boolean {
  return Boolean(settings.trackingEndsAt && settings.trackingEndsAt > now);
}

/**
 * Prepares the four programme fields of a System Settings PATCH in place:
 * text is trimmed and an empty or placeholder value becomes null, and the
 * tracking end date (a date or an ISO instant) becomes a Date or null. A value
 * that is not a date is dropped so the stored one is kept.
 */
export function coerceEmailProgramFields(body: Record<string, unknown>): void {
  for (const key of [
    "emailFooterName",
    "emailFooterAddress",
    "emailTrialPromoCode",
  ] as const) {
    if (!(key in body)) continue;
    const value = body[key];
    body[key] = typeof value === "string" ? cleanSetting(value) : null;
  }
  if ("emailTrackingEndsAt" in body) {
    const value = body.emailTrackingEndsAt;
    if (value === null || value === "") {
      body.emailTrackingEndsAt = null;
    } else if (typeof value === "string") {
      /* A date alone means the end of that day, UTC. */
      const date = newDate(
        /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value
      );
      if (Number.isNaN(date.getTime())) delete body.emailTrackingEndsAt;
      else body.emailTrackingEndsAt = date;
    } else {
      delete body.emailTrackingEndsAt;
    }
  }
}
