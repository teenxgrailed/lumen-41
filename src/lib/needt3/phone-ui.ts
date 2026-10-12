/**
 * Which UI the person gets: the phone's (menu A over full-height screens) or
 * the desktop's (rail and top bar). Pure, so the server (the `(app)` layout
 * reads the request) and the client (a width listener) share one decision.
 *
 * Only the shell layer depends on this. The route children are rendered in one
 * stable tree position by `ShellFrame` (docs/port/02-task-plan.md §5), so a
 * resize across 700 px swaps the chrome and never remounts a page.
 */

export type PhoneUi = "phone" | "desktop";

/** The cookie that pins a side ("phone" | "desktop"); a Settings switch can set it. */
export const PHONE_UI_COOKIE = "needt-ui";

/** Narrower than this many CSS px, the phone UI is the layout. */
export const PHONE_BREAKPOINT_PX = 700;

/** The media query for the phone side (0.02 px under the breakpoint, like the rail's). */
export const PHONE_MEDIA_QUERY = `(max-width: ${PHONE_BREAKPOINT_PX - 0.02}px)`;

/** The cookie's value as a side, or null when it is absent or unknown. */
export function parseUiCookie(
  value: string | null | undefined
): PhoneUi | null {
  const v = (value ?? "").trim().toLowerCase();
  return v === "phone" || v === "desktop" ? v : null;
}

export interface PhoneUiRequest {
  /** The `Sec-CH-UA-Mobile` request header ("?1" on a phone). */
  secChUaMobile?: string | null;
  /** The `User-Agent` request header. */
  userAgent?: string | null;
  /** The value of the `needt-ui` cookie. */
  cookie?: string | null;
}

const IOS = /\b(iPhone|iPad|iPod)\b/;
const ANDROID = /\bAndroid\b/i;

/**
 * The server's pick for the first render: the cookie wins; else the
 * `Sec-CH-UA-Mobile: ?1` hint; else a user agent from iOS (iPhone, iPad,
 * iPod) or Android. Anything else is the desktop.
 */
export function phoneUiFrom(req: PhoneUiRequest): PhoneUi {
  const pinned = parseUiCookie(req.cookie);
  if (pinned) return pinned;
  if ((req.secChUaMobile ?? "").trim() === "?1") return "phone";
  const ua = req.userAgent ?? "";
  return IOS.test(ua) || ANDROID.test(ua) ? "phone" : "desktop";
}

export interface ResolveUiInput {
  /** What the server rendered (`phoneUiFrom`). */
  initial: PhoneUi;
  /** True when the cookie pinned `initial`: the width never overrides it. */
  forced: boolean;
  /**
   * The width query's answer once the client has read it
   * (`matchMedia(PHONE_MEDIA_QUERY).matches`); null before that, so the first
   * client render is the server's and hydration never mismatches.
   */
  narrow: boolean | null;
}

/**
 * The UI to draw now. A pinned side wins; before the client has measured, the
 * server's pick stands; after, the width decides.
 */
export function resolvePhoneUi({
  initial,
  forced,
  narrow,
}: ResolveUiInput): PhoneUi {
  if (forced || narrow === null) return initial;
  return narrow ? "phone" : "desktop";
}
