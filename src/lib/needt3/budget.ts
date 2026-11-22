/**
 * Needt Budget as a place in Needt (openspec `add-budget-module`). Pure.
 *
 * Budget is its own app (budget.needt.app); Needt shows it in a frame inside
 * the shell, signed in through Needt's own OpenID Connect provider. The place
 * exists only while the `budget_module` flag is on for the person. On Free it
 * is a grey row with a PRO pill that cannot be hidden and opens a promo with
 * no data; on Pro a switch in Settings -> General hides it, and the first
 * visit shows the promo once before Budget itself.
 */

export const BUDGET_HREF = "/budget";

/** Where Budget lives. Same site as use.needt.app, so its session cookie
 *  (SameSite=Lax) reaches the frame. */
export const BUDGET_ORIGIN = (
  process.env.NEXT_PUBLIC_BUDGET_URL || "https://budget.needt.app"
).replace(/\/+$/, "");

/** `UserSettings.prefs` key: Pro keeps Budget in the sidebar (default true). */
export const BUDGET_SIDEBAR_PREF = "budgetInSidebar";

/** `UserSettings.prefs` key: the one-time promo was seen. On the account, so
 *  another device does not show it again. */
export const BUDGET_PROMO_PREF = "budgetPromoSeen";

/** How long the first-visit promo stays before Budget opens on its own. */
export const BUDGET_PROMO_MS = 10_000;

export interface BudgetNavItem {
  href: string;
  label: string;
  /** Free: grey, with a PRO pill. */
  locked: boolean;
}

/**
 * The item to draw, or null. `pro` is undefined until the plan has loaded
 * and `prefs` until settings have: the row waits for both, so it never
 * flashes a PRO pill at someone who has paid, nor shows a row they hid.
 */
export function budgetNavItem(args: {
  enabled: boolean;
  pro: boolean | undefined;
  prefs: Record<string, unknown> | null | undefined;
}): BudgetNavItem | null {
  if (!args.enabled || args.pro === undefined) return null;
  const item = { href: BUDGET_HREF, label: "Budget" };
  // Free cannot hide it: the row is how Budget is found.
  if (args.pro === false) return { ...item, locked: true };
  if (!args.prefs || args.prefs[BUDGET_SIDEBAR_PREF] === false) return null;
  return { ...item, locked: false };
}

/** Whether a pathname is on the Budget screen. */
export function isBudgetPath(pathname: string) {
  return pathname === BUDGET_HREF || pathname.startsWith(`${BUDGET_HREF}/`);
}

export type BudgetView = "loading" | "promo" | "intro" | "app";

/**
 * What the screen shows: nothing until the plan is known; Free the promo (no
 * data, upgrade buttons); Pro the promo once ("intro", with Open), then Budget.
 */
export function budgetView(args: {
  pro: boolean | undefined;
  promoSeen: boolean | undefined;
}): BudgetView {
  if (args.pro === undefined) return "loading";
  if (!args.pro) return "promo";
  if (args.promoSeen === undefined) return "loading";
  return args.promoSeen ? "app" : "intro";
}

/** The promo flag as stored: true, or not seen (undefined while loading). */
export function promoSeenFrom(
  prefs: Record<string, unknown> | null | undefined,
  loaded: boolean
): boolean | undefined {
  if (!loaded) return undefined;
  return prefs?.[BUDGET_PROMO_PREF] === true;
}

/** The frame's address: Budget's home in its chromeless mode, in Needt's theme. */
export function budgetFrameSrc(
  theme: "light" | "dark",
  origin: string = BUDGET_ORIGIN
): string {
  return `${origin}/dashboard?embed=1&theme=${theme}`;
}

/** The message that keeps the frame on Needt's theme when it changes. */
export function budgetThemeMessage(theme: "light" | "dark") {
  return { type: "needt:theme", theme } as const;
}

/** What Budget posts to Needt once its embedded page has drawn. */
export const BUDGET_READY_TYPE = "needt:budget-ready";

/** How long the frame may stay without that message before the way out shows. */
export const BUDGET_FALLBACK_MS = 8_000;

/** `localStorage` key: this device has heard the ready message from Budget. */
export const BUDGET_READY_SEEN_KEY = "needt.budgetReadySeen";

/** Whether a window message is Budget saying its embedded page is up. */
export function isBudgetReadyMessage(event: {
  origin: string;
  data: unknown;
}): boolean {
  if (event.origin !== BUDGET_ORIGIN) return false;
  const data = event.data as { type?: unknown } | null;
  return !!data && typeof data === "object" && data.type === BUDGET_READY_TYPE;
}

/**
 * Budget opened as its own page (no `embed`): the way out when the frame
 * stays blank. Its own sign-in through Needt runs top-level, where Needt's
 * pages can render.
 */
export function budgetOpenHref(origin: string = BUDGET_ORIGIN): string {
  return `${origin}/dashboard`;
}

/**
 * Whether the way out shows. The ready message is the proof the frame works.
 * Until Budget is known to send it (heard once on this device), only the phone
 * shows the way out, so a working desktop frame is never second-guessed.
 */
export function budgetFallbackVisible(args: {
  ready: boolean;
  waited: boolean;
  phone: boolean;
  readySeenBefore: boolean;
}): boolean {
  if (args.ready || !args.waited) return false;
  return args.phone || args.readySeenBefore;
}
