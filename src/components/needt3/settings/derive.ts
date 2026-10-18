/**
 * Settings derivations (SettingsScreen.jsx), pure so they are tested apart
 * from the sheet: the sections, the `/settings#section` deep link, what Free
 * locks, and the hour / weekday helpers the Your day rows need.
 */
import { calendarConnectionNotice } from "@/lib/calendar-connection-status";
import { formatShortDate, newDate } from "@/lib/date-utils";
import type { CheckoutChoice } from "@/lib/needt3/hooks/account";
import type { AccentId, ThemeChoice, TimeReading } from "@/lib/needt3/theme";

export type SectionId =
  | "account"
  | "plan"
  | "general"
  | "appearance"
  | "day"
  | "tasks"
  | "focus"
  | "alerts"
  | "keys"
  | "data"
  | "about";

export interface NavItem {
  id: SectionId | "connections";
  name: string;
  /** Opens another screen instead of a section. */
  jump?: string;
}

export const SETTINGS_NAV: readonly {
  group: string;
  items: readonly NavItem[];
}[] = [
  {
    group: "",
    items: [
      { id: "account", name: "Account" },
      { id: "plan", name: "Plan & billing" },
    ],
  },
  {
    group: "Preferences",
    items: [
      { id: "general", name: "General" },
      { id: "appearance", name: "Appearance" },
      { id: "day", name: "Your day" },
      { id: "tasks", name: "Tasks" },
      { id: "focus", name: "Focus" },
      { id: "alerts", name: "Notifications" },
      { id: "keys", name: "Shortcuts" },
    ],
  },
  {
    group: "",
    items: [
      { id: "connections", name: "Connections", jump: "/connections" },
      { id: "data", name: "Data & privacy" },
    ],
  },
  { group: "", items: [{ id: "about", name: "About" }] },
];

export const SECTION_TITLES: Record<SectionId, string> = {
  general: "General",
  day: "Your day",
  tasks: "Tasks",
  focus: "Focus",
  appearance: "Appearance",
  alerts: "Notifications",
  keys: "Shortcuts",
  data: "Data & privacy",
  account: "Account",
  plan: "Plan & billing",
  about: "About",
};

/** Sections the arrow keys walk through (jump rows leave Settings). */
export const NAV_FLAT: readonly SectionId[] = SETTINGS_NAV.flatMap((g) =>
  g.items.filter((i) => !i.jump).map((i) => i.id as SectionId)
);

export const DEFAULT_SECTION: SectionId = "account";

/** Old settings anchors the app still links to, mapped to a section. */
const HASH_ALIASES: Record<string, SectionId> = {
  billing: "plan",
  subscription: "plan",
  appearance: "appearance",
  notifications: "alerts",
  schedule: "day",
  hours: "day",
  account: "account",
  data: "data",
  shortcuts: "keys",
};

export function isSectionId(value: unknown): value is SectionId {
  return typeof value === "string" && value in SECTION_TITLES;
}

/**
 * `/settings#plan` → "plan". Accepts the section id or an old anchor
 * (`#billing`), with or without the `#`. Anything else is `null`, so the
 * sheet opens on its default.
 */
export function sectionFromHash(hash: string | null | undefined) {
  const key = (hash ?? "").replace(/^#/, "").trim().toLowerCase();
  if (!key) return null;
  if (isSectionId(key)) return key;
  return HASH_ALIASES[key] ?? null;
}

/** `?checkout=` values the landing links to, and the choice each one starts. */
export const CHECKOUT_LINKS = {
  "pro-year": { plan: "pro", interval: "year" },
  "pro-month": { plan: "pro", interval: "month" },
  lifetime: { plan: "lifetime" },
} as const satisfies Record<string, CheckoutChoice>;

/**
 * `/settings?section=billing&checkout=pro-year`: the checkout a deep link asks
 * for, or null (no param, or one we do not know, which is ignored).
 */
export function checkoutFromSearch(
  search: string | URLSearchParams | null | undefined
): CheckoutChoice | null {
  const q = new URLSearchParams(search ?? "");
  const key = q.get("checkout")?.trim().toLowerCase() ?? "";
  return Object.prototype.hasOwnProperty.call(CHECKOUT_LINKS, key)
    ? CHECKOUT_LINKS[key as keyof typeof CHECKOUT_LINKS]
    : null;
}

/**
 * The same URL with `checkout` removed, so a reload does not start another
 * checkout. Everything else in the query and the hash is kept.
 */
export function withoutCheckoutParam(url: string): string {
  const u = new URL(url, "https://needt.invalid");
  u.searchParams.delete("checkout");
  return `${u.pathname}${u.search}${u.hash}`;
}

/**
 * The Settings section a link names: `#plan` / `#billing` in the hash, else
 * `?section=billing`. The hash wins when both are present.
 */
export function settingsSectionFromUrl(
  hash: string | null | undefined,
  search: string | URLSearchParams | null | undefined
): SectionId | null {
  return (
    sectionFromHash(hash) ??
    sectionFromHash(new URLSearchParams(search ?? "").get("section"))
  );
}

/** Old anchors that now live on another screen, not in the sheet. */
const HASH_SCREENS: Record<string, string> = {
  calendars: "/connections",
  calendar: "/connections",
  accounts: "/connections",
  integrations: "/connections",
  "task-sync": "/connections",
  // The AI tools tab of Connections (Claude, ChatGPT, … and the Pro lock).
  ai: "/connections#ai",
  "ai-assistant": "/connections#ai",
  connectors: "/connections#ai",
};

export type SettingsRedirectTarget =
  | { kind: "screen"; href: string }
  | { kind: "sheet"; section: SectionId | null };

/**
 * Where `/settings#hash` goes with design_v3 on: another screen for the
 * anchors that moved out of Settings (calendars, integrations, AI), else the
 * sheet over Today at the matching section.
 */
export function settingsRedirectTarget(
  hash: string | null | undefined,
  search?: string | URLSearchParams | null
): SettingsRedirectTarget {
  const key = (hash ?? "").replace(/^#/, "").trim().toLowerCase();
  const href = HASH_SCREENS[key];
  return href
    ? { kind: "screen", href }
    : { kind: "sheet", section: settingsSectionFromUrl(key, search) };
}

export interface SettingsNotice {
  tone: "success" | "error";
  title: string;
  description?: string;
}

/**
 * What a redirect back to `/settings?…` came to say: a calendar OAuth result,
 * a finished checkout, a confirmed email. Read before the URL is replaced,
 * because the query is dropped with it.
 */
export function settingsNotices(search: string | URLSearchParams) {
  const q = typeof search === "string" ? new URLSearchParams(search) : search;
  const out: SettingsNotice[] = [];
  const cal = calendarConnectionNotice(
    q.get("calendarError"),
    q.get("calendarSuccess"),
    q.get("provider")
  );
  if (cal)
    out.push({
      tone: cal.tone,
      title: cal.title,
      description: cal.description,
    });
  if (q.get("billing") === "success")
    out.push({
      tone: "success",
      title: "Checkout complete",
      description:
        "Your plan updates here as soon as the payment is confirmed.",
    });
  if (q.get("emailVerification") === "verified")
    out.push({ tone: "success", title: "Email confirmed" });
  const imp = IMPORT_NOTICES[q.get("import") ?? ""];
  if (imp) out.push(imp);
  return out;
}

const IMPORT_NOTICES: Record<string, SettingsNotice> = {
  "todoist-started": {
    tone: "success",
    title: "Todoist import started",
    description: "Progress shows in Data & privacy.",
  },
  "todoist-running": {
    tone: "success",
    title: "A Todoist import is already running",
  },
  "todoist-denied": {
    tone: "error",
    title: "Todoist import cancelled",
    description: "Todoist access was not granted.",
  },
  "todoist-failed": {
    tone: "error",
    title: "Todoist import could not start",
    description: "Try again in a minute.",
  },
  "notion-started": {
    tone: "success",
    title: "Notion import started",
    description: "Progress shows in Data & privacy.",
  },
  "notion-running": {
    tone: "success",
    title: "A Notion import is already running",
  },
  "notion-denied": {
    tone: "error",
    title: "Notion import cancelled",
    description: "Notion access was not granted.",
  },
  "notion-failed": {
    tone: "error",
    title: "Notion import could not start",
    description: "Try again in a minute.",
  },
};

/* ---------- import status ---------- */

export interface ImportRunSummaryInput {
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  counts: { total: number; done: number; skipped: number; failed: number };
  warnings: { code: string; message: string }[];
}

/** One line for the Import row: what the last run did, or is doing. */
export function importRunSummary(run: ImportRunSummaryInput): string {
  const { total, done, skipped, failed } = run.counts;
  switch (run.status) {
    case "queued":
      return "Waiting to start.";
    case "running": {
      const seen = done + skipped + failed;
      return total > 0 ? `Importing: ${seen} of ${total}.` : "Importing.";
    }
    case "done":
      return (
        `Last import: ${done} imported, ${skipped} skipped` +
        (failed ? `, ${failed} failed.` : ".")
      );
    case "cancelled":
      return `Last import was cancelled after ${done} imported.`;
    case "failed": {
      const reason = [...run.warnings]
        .reverse()
        .find(
          (w) =>
            w.code.startsWith("todoist_") ||
            w.code.startsWith("notion_") ||
            w.code.endsWith("_unavailable") ||
            w.code === "import_failed"
        );
      return `Last import failed. ${reason?.message ?? "Try again."}`;
    }
  }
}

/** The section a store value names, falling back to the default. */
export function sectionOf(value: string | null | undefined): SectionId {
  return sectionFromHash(value) ?? DEFAULT_SECTION;
}

/* ---------- plan and what Free locks ---------- */

/** Pro features are on from the trial through every paid plan. */
export function isPro(kind: string | null | undefined) {
  return !!kind && kind !== "free";
}

/** Blue is yours on Free; the other eight come with Pro (paywall.jsx). */
export const FREE_ACCENT: AccentId = "blue";

export function accentLocked(id: AccentId, kind: string | null | undefined) {
  return !isPro(kind) && id !== FREE_ACCENT;
}

/** The Time theme is Pro; System, Light and Dark are free. */
export function themeLocked(
  theme: ThemeChoice,
  kind: string | null | undefined
) {
  return theme === "time" && !isPro(kind);
}

/** "Plan my day puts first" is a Pro setting. */
export const ORDER_LOCKED_FOR_FREE = true;

export interface PlanInfo {
  name: string;
  badge: string;
}

export function planInfo(kind: string | null | undefined): PlanInfo {
  switch (kind) {
    case "trial":
      return { name: "Pro trial", badge: "Trial" };
    case "monthly":
      return { name: "Pro Monthly", badge: "Pro" };
    case "yearly":
      return { name: "Pro Yearly", badge: "Pro" };
    case "lifetime":
      return { name: "Lifetime", badge: "Lifetime" };
    default:
      return { name: "Free", badge: "Free" };
  }
}

/**
 * "renews 7 Oct 2027" for a paid plan whose period end is known (the
 * prototype's plan line: "$59 / year ($4.92/mo) · renews 7 Oct 2027"); the
 * year is left off for a date within the next 11 months, as the monthly line
 * ("renews 7 Nov"). Empty when there is no date.
 */
export function renewsText(
  periodEnd: string | null | undefined,
  now: Date,
  cancelAtPeriodEnd = false
): string {
  if (!periodEnd) return "";
  const d = newDate(periodEnd);
  if (Number.isNaN(d.getTime())) return "";
  const soon = d.getTime() - now.getTime() < 330 * 86_400_000;
  /* A subscription set to cancel does not renew: it ends on that date. */
  return `${cancelAtPeriodEnd ? "ends" : "renews"} ${formatShortDate(d, !soon)}`;
}

/** Width of the trial bar: days left over the trial length, 0–100. */
export function trialBarPct(daysLeft: number | null, trialDays: number) {
  if (daysLeft === null || trialDays <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((daysLeft / trialDays) * 100)));
}

/* ---------- Your day ---------- */

export const HOUR_OPTIONS: readonly (readonly [string, string])[] = [
  "07:00",
  "08:00",
  "08:30",
  "09:00",
  "10:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
].map((h) => [h, h] as const);

/** The auto-schedule columns are whole hours; "08:30" has no home there. */
export function hourOf(value: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!m || m[2] !== "00") return null;
  return Number(m[1]);
}

export const hourLabel = (hour: number) =>
  `${String(Math.max(0, Math.min(23, hour))).padStart(2, "0")}:00`;

/** Hour options for a select, adding the stored hour if the list lacks it. */
export function hourOptions(current: number | null | undefined) {
  const value =
    current === null || current === undefined ? null : hourLabel(current);
  const base = HOUR_OPTIONS.filter(([v]) => hourOf(v) !== null || v === value);
  if (value && !base.some(([v]) => v === value)) {
    return [...base, [value, value] as const].sort((a, b) =>
      a[0].localeCompare(b[0])
    );
  }
  return base;
}

/** The day has to start before it ends. */
export const workHoursValid = (start: number, end: number) => start < end;

/**
 * Options for "Day starts" / "Day ends": the hours that keep start before end,
 * given the other end's stored hour. The current value is always kept so the
 * select can show what is stored.
 */
export function workHourChoices(
  which: "start" | "end",
  own: number | null | undefined,
  other: number | null | undefined
) {
  return hourOptions(own).filter(([v]) => {
    const h = hourOf(v);
    if (h === null || other === null || other === undefined) return true;
    if (h === own) return true;
    return which === "start"
      ? workHoursValid(h, other)
      : workHoursValid(other, h);
  });
}

/** `workDays` is a JSON string of weekday numbers, 0 = Sunday. */
export function parseWorkDays(raw: string | null | undefined): number[] {
  try {
    const v = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(v)
      ? v.filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= 6)
      : [];
  } catch {
    return [];
  }
}

export const plansWeekends = (days: readonly number[]) =>
  days.includes(0) || days.includes(6);

/** Turn Saturday and Sunday on or off; weekdays are left alone. */
export function withWeekends(days: readonly number[], on: boolean): number[] {
  const weekdays = days.filter((d) => d >= 1 && d <= 5);
  return on ? [...weekdays, 6, 0].sort((a, b) => a - b) : weekdays;
}

export const minutes = (list: readonly number[]) =>
  list.map((m) => [String(m), `${m} min`] as const);

/** One line for the folded "Planning options" row. */
export function planningSummary(opts: {
  weekends: boolean;
  bufferMinutes: number;
}) {
  return `${opts.weekends ? "Plans on weekends" : "Weekdays only"} · ${opts.bufferMinutes}-min gap`;
}

/* ---------- UI-only preferences (UserSettings.prefs) ---------- */

/**
 * Keys the sheet stores in `UserSettings.prefs` (01-data-map open question 6:
 * UI-only keys in one map; anything the server reads gets a typed column).
 * Nothing reads them yet except the screens named next to each; they exist
 * so the choice survives a reload.
 */
export const PREF_DEFAULTS = {
  /** Composer / new-task dialog default (the Composer ignores it in the prototype too). */
  est: "30",
  project: "none",
  parts: true,
  money: true,
  len: "50",
  brk: "10",
  /** The Focus window's last choices (focus.jsx focusAmbient / focusHideOthers). */
  focusAmbient: "off",
  focusHideOthers: false,
  sound: "tick",
  hideAlerts: true,
  snapSound: false,
  /** Stored inverted, as in the prototype: true = the logo stays still. */
  stopMark: false,
  links: "ask",
  /** Home's weather line; empty = no line. */
  city: "",
  offline: true,
  usage: true,
} as const;

export type PrefKey = keyof typeof PREF_DEFAULTS;

export function readPref<K extends PrefKey>(
  prefs: Record<string, unknown> | null | undefined,
  key: K
): (typeof PREF_DEFAULTS)[K] {
  const fallback = PREF_DEFAULTS[key];
  const v = prefs?.[key];
  return (
    typeof v === typeof fallback ? v : fallback
  ) as (typeof PREF_DEFAULTS)[K];
}

/** The accent a person saved, or the default when none or unknown. */
export function accentFromPrefs(
  prefs: Record<string, unknown> | null | undefined
) {
  const v = prefs?.accent;
  return typeof v === "string" ? v : undefined;
}

/** Local hours as "HH:MM" (Drift.jsx `fmtHour`). */
export function fmtHour(h: number | null | undefined) {
  if (h == null) return "—";
  const m = Math.round(h * 60) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * The Time card's live reading (Drift.jsx `line`): where the sun is and what
 * comes next, e.g. "Now: Day · sunset 19:42 · Zürich". `icon` names the glyph
 * the row draws beside it.
 */
export function timeNow(t: Pick<TimeReading, "phase" | "times" | "place">) {
  const night = t.phase === "Night" || t.phase === "Dawn";
  const upcoming = night
    ? t.times.sunrise != null
      ? `sunrise ${fmtHour(t.times.sunrise)}`
      : "no sunrise today"
    : t.times.sunset != null
      ? `sunset ${fmtHour(t.times.sunset)}`
      : "no sunset today";
  const icon: "sunrise" | "sunset" | "sun" =
    t.phase === "Dawn"
      ? "sunrise"
      : t.phase === "Dusk" || t.phase === "Night"
        ? "sunset"
        : "sun";
  return { line: `Now: ${t.phase} · ${upcoming} · ${t.place.name}`, icon };
}
