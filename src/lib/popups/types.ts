/**
 * In-app popups: the shared vocabulary. Client-safe (no Prisma client, no
 * server code) so the host component, the coordinator and the API agree.
 *
 * One popup shell serves two families that share one frequency cap:
 * announcements (authored as data) and plan moments (a limit hit, a trial
 * ending). The feedback prompt plugs in as a third `source`.
 */

export const POPUP_PLANS = ["FREE", "TRIAL", "PRO", "LIFETIME"] as const;
export type PopupPlan = (typeof POPUP_PLANS)[number];

export const POPUP_PLATFORMS = ["web", "ios", "mac", "windows"] as const;
export type PopupPlatform = (typeof POPUP_PLATFORMS)[number];

export const ANNOUNCEMENT_KINDS = ["update", "tip", "event", "offer"] as const;
export type AnnouncementKindName = (typeof ANNOUNCEMENT_KINDS)[number];

/** Where a popup comes from. `feedback` is the feedback prompt's slot. */
export type PopupSource = "limit" | "trial" | "announcement" | "feedback";

/** The limits a Free account can hit. Each maps to a check in `@/lib/entitlements`. */
export const POPUP_LIMITS = [
  "habits",
  "ai",
  "boards",
  "calendars",
  "auto_schedule",
] as const;
export type PopupLimit = (typeof POPUP_LIMITS)[number];

/** Icons a bullet may name: real in-app icons, never a letter tile. */
export const BULLET_ICONS = [
  "check",
  "calendar",
  "sparkles",
  "clock",
  "zap",
  "repeat",
  "layers",
  "bell",
  "target",
  "gift",
] as const;
export type BulletIcon = (typeof BULLET_ICONS)[number];

export interface PopupBullet {
  icon: BulletIcon;
  text: string;
}

/** In-app actions a call to action may run. */
export const POPUP_ACTIONS = ["paywall"] as const;
export type PopupAction = (typeof POPUP_ACTIONS)[number];

export interface PopupCta {
  label: string;
  /** A same-origin path. */
  href?: string;
  action?: PopupAction;
}

/** A plan card on a plan moment. The price line is added on the client from the one pricing module. */
export interface PopupPlanCard {
  plan: "pro" | "lifetime";
  /** Which paywall card to preselect. */
  pick: "annual" | "lifetime";
}

/** What the host draws. */
export interface PopupView {
  /** The id the event endpoint takes: an announcement id, or `moment:<source>:<key>`. */
  id: string;
  source: PopupSource;
  key: string;
  kind: AnnouncementKindName | "limit" | "trial";
  badge: string | null;
  title: string;
  body: string;
  bullets: PopupBullet[];
  imageUrl: string | null;
  primary: PopupCta | null;
  secondary: string | null;
  cards: PopupPlanCard[];
  /** The feature the paywall names when a card opens it. */
  feature: string | null;
}

/** A popup that could be shown now. `priority` orders within a source. */
export interface PopupCandidate {
  source: PopupSource;
  /** Stable name of the moment or the announcement id. */
  key: string;
  priority: number;
  view: PopupView;
}

/** Something already shown to this person, from any source. */
export interface PopupHistoryEntry {
  source: PopupSource;
  key: string;
  shownAt: Date;
}

export interface PopupUser {
  id: string;
  plan: PopupPlan;
  signedUpAt: Date;
  /** Show announcements at all ("Product updates" in Settings). */
  productUpdates: boolean;
}

/** What only the client knows, sent along with the request. */
export interface PopupContext {
  inOnboarding?: boolean;
  inFocus?: boolean;
  dialogOpen?: boolean;
  /** A popup was already shown in this browser session. */
  shownThisSession?: boolean;
}

export const MOMENT_ID_PREFIX = "moment:";

export function momentId(source: PopupSource, key: string): string {
  return `${MOMENT_ID_PREFIX}${source}:${key}`;
}

export function parseMomentId(
  id: string
): { source: PopupSource; key: string } | null {
  if (!id.startsWith(MOMENT_ID_PREFIX)) return null;
  const rest = id.slice(MOMENT_ID_PREFIX.length);
  const cut = rest.indexOf(":");
  if (cut <= 0) return null;
  const source = rest.slice(0, cut);
  const key = rest.slice(cut + 1);
  if (
    (source !== "limit" && source !== "trial" && source !== "feedback") ||
    !key
  ) {
    return null;
  }
  return { source, key };
}
