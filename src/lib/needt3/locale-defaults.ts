/**
 * First-run locale defaults: the time zone, first day of the week and clock
 * a new account starts with.
 *
 * `UserSettings` defaults to UTC, Sunday and 12h. Someone in Berlin then sees
 * every time an hour or two off until they find Settings. So the zone the
 * browser reports is written once — at sign-up when the form can send it, else
 * on the first signed-in load — together with a week start and clock derived
 * from the browser language. `prefs.tzAutoSet` records that this happened, so
 * a value the person later picks (UTC included) is never replaced.
 *
 * Pure: shared by the sign-up routes on the server and the first-run hook in
 * the browser.
 */

export type WeekStartDay = "monday" | "sunday";
export type TimeFormat = "12h" | "24h";

/** `prefs` key: the first-run zone write has happened (or was not needed). */
export const TZ_AUTO_SET_PREF = "tzAutoSet";

/** The schema defaults (prisma/schema.prisma `UserSettings`). */
export const DEFAULT_WEEK_START: WeekStartDay = "sunday";
export const DEFAULT_TIME_FORMAT: TimeFormat = "12h";

/** Zones that mean "never chosen": the schema default and its alias. */
const UNSET_ZONES = new Set(["", "UTC", "Etc/UTC"]);

/**
 * Regions whose week starts on Sunday (CLDR `firstDay`), plus the ones that
 * start on Saturday, for which Sunday is the nearer of the two we store.
 * Everywhere else, most of Europe included, gets ISO 8601 Monday.
 */
const SUNDAY_REGIONS = new Set(
  (
    "AG AS BD BR BS BT BW BZ CA CO DM DO ET GT GU HK HN ID IL IN JM JP KE KH " +
    "KR LA MH MM MO MT MX MZ NI NP PA PE PH PK PR PT PY SA SG SV TH TT TW UM " +
    "US VE VI WS YE ZA ZW " +
    "AE AF BH DJ DZ EG IQ IR JO KW LY OM QA SD SY"
  ).split(" ")
);

export function isUnsetTimeZone(zone: string | null | undefined): boolean {
  return UNSET_ZONES.has(zone ?? "");
}

/** An IANA zone this runtime can format in. */
export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function canonicalLocale(language: string): Intl.Locale | null {
  try {
    return new Intl.Locale(language.replace(/_/g, "-"));
  } catch {
    return null;
  }
}

/** "de-AT" → "AT"; a bare "de" → its likely region, "DE". */
export function regionOf(language: string | null | undefined): string | null {
  if (!language) return null;
  const locale = canonicalLocale(language);
  if (!locale) return null;
  if (locale.region) return locale.region.toUpperCase();
  try {
    return locale.maximize().region?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

/**
 * Week start and clock for a browser language (`navigator.language`).
 * `null` when the language says nothing usable.
 */
export function localeDefaults(
  language: string | null | undefined
): { weekStartDay: WeekStartDay; timeFormat: TimeFormat } | null {
  const region = regionOf(language);
  if (!region || !language) return null;
  const weekStartDay: WeekStartDay = SUNDAY_REGIONS.has(region)
    ? "sunday"
    : "monday";
  let timeFormat: TimeFormat = region === "US" ? "12h" : "24h";
  try {
    // The platform's own clock for the locale (en-AU and en-IN are 12h,
    // fr-CA is 24h); the US-only rule above is the fallback.
    const cycle = new Intl.DateTimeFormat(language.replace(/_/g, "-"), {
      hour: "numeric",
    }).resolvedOptions().hourCycle;
    if (cycle) timeFormat = cycle === "h11" || cycle === "h12" ? "12h" : "24h";
  } catch {
    /* keep the fallback */
  }
  return { weekStartDay, timeFormat };
}

export interface StoredLocaleSettings {
  timeZone: string;
  weekStartDay: string;
  timeFormat: string;
  prefs: Record<string, unknown>;
}

export interface BrowserLocale {
  timeZone: string | null | undefined;
  language: string | null | undefined;
}

export interface LocalePatch {
  timeZone?: string;
  weekStartDay?: WeekStartDay;
  timeFormat?: TimeFormat;
  prefs: Record<string, unknown>;
}

/**
 * The one write the first signed-in load makes, or `null` for none.
 *
 * - Already done (`prefs.tzAutoSet`): nothing, ever again.
 * - Zone still the default and the browser knows a real one: write the zone,
 *   and turn a still-default Sunday / 12h into the language's week and clock.
 * - Zone already chosen (sign-up sent it, or the person picked it): only mark
 *   it done, so a later deliberate UTC is not taken for "unset".
 * - Zone unset but the browser reports none (or UTC): wait for a later load.
 */
export function firstRunLocalePatch(
  stored: StoredLocaleSettings,
  browser: BrowserLocale
): LocalePatch | null {
  if (stored.prefs[TZ_AUTO_SET_PREF] === true) return null;
  const prefs = { ...stored.prefs, [TZ_AUTO_SET_PREF]: true };
  if (!isUnsetTimeZone(stored.timeZone)) return { prefs };

  const zone = browser.timeZone;
  if (!isValidTimeZone(zone) || isUnsetTimeZone(zone)) return null;

  const patch: LocalePatch = { timeZone: zone, prefs };
  const derived = localeDefaults(browser.language);
  if (derived) {
    if (
      stored.weekStartDay === DEFAULT_WEEK_START &&
      derived.weekStartDay !== DEFAULT_WEEK_START
    )
      patch.weekStartDay = derived.weekStartDay;
    if (
      stored.timeFormat === DEFAULT_TIME_FORMAT &&
      derived.timeFormat !== DEFAULT_TIME_FORMAT
    )
      patch.timeFormat = derived.timeFormat;
  }
  return patch;
}

/**
 * What a sign-up form sent (`timeZone`, `locale`) as the new row's columns.
 * Anything missing or invalid is left to the schema defaults, and the first
 * signed-in load fills it in instead.
 */
export function signupLocaleSettings(input: {
  timeZone?: unknown;
  locale?: unknown;
}): {
  timeZone?: string;
  weekStartDay?: WeekStartDay;
  timeFormat?: TimeFormat;
  prefs?: Record<string, boolean>;
} {
  const zone = input.timeZone;
  if (!isValidTimeZone(zone) || isUnsetTimeZone(zone)) return {};
  const language =
    typeof input.locale === "string" && input.locale.length <= 35
      ? input.locale
      : null;
  return {
    timeZone: zone,
    ...(localeDefaults(language) ?? {}),
    prefs: { [TZ_AUTO_SET_PREF]: true },
  };
}

/** The browser's zone and language, for a sign-up request body. */
export function browserLocale(): { timeZone?: string; locale?: string } {
  const out: { timeZone?: string; locale?: string } = {};
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) out.timeZone = zone;
  } catch {
    /* no zone */
  }
  if (typeof navigator !== "undefined" && navigator.language)
    out.locale = navigator.language;
  return out;
}
