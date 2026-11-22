import type {
  PopupCandidate,
  PopupContext,
  PopupHistoryEntry,
  PopupSource,
  PopupUser,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** At most one popup per person in this window. */
export const POPUP_CAP_MS = 3 * DAY_MS;
/** Nothing but a trial-ending moment in the first days after signup. */
export const POPUP_QUIET_AFTER_SIGNUP_MS = 2 * DAY_MS;
/** A limit popup appears at most once per limit in this window. */
export const LIMIT_REPEAT_MS = 7 * DAY_MS;
/** Lower comes first: limit-hit, then trial ending, then announcements, then feedback. */
const SOURCE_RANK: Record<PopupSource, number> = {
  limit: 0,
  trial: 1,
  announcement: 2,
  feedback: 3,
};

function lastShownAt(history: readonly PopupHistoryEntry[]): number | null {
  let last: number | null = null;
  for (const entry of history) {
    const at = entry.shownAt.getTime();
    if (last === null || at > last) last = at;
  }
  return last;
}

function shownBefore(
  history: readonly PopupHistoryEntry[],
  source: PopupSource,
  key: string,
  since: number | null
): boolean {
  return history.some(
    (entry) =>
      entry.source === source &&
      entry.key === key &&
      (since === null || entry.shownAt.getTime() > since)
  );
}

/**
 * The one coordinator. Of everything that could be shown, which popup (if
 * any) appears now. Pure: the clock and every fact come in as arguments.
 *
 * Rules:
 * - Never during onboarding or focus, with another dialog open, or twice in
 *   one session (`ctx`).
 * - Never in the first 2 days after signup, except a trial-ending moment.
 * - At most 1 popup per 3 days across every source. Owner rulings
 *   (22.11.2026): a limit hit bypasses the cap but repeats at most once per
 *   limit per 7 days; each trial moment (3d, 1d, ended) bypasses the cap and
 *   shows at most once.
 * - An announcement is shown once ever, and not at all when the person turned
 *   product updates off. Plan moments ignore that switch.
 * - Priority: limit-hit > trial ending > announcement (by `priority`, higher
 *   first) > feedback.
 *
 * The feedback prompt plugs in by passing candidates with `source: "feedback"`
 * and writing its shows to the history (`recordPopupShown`).
 */
export function pickPopup(
  user: PopupUser,
  candidates: readonly PopupCandidate[],
  history: readonly PopupHistoryEntry[],
  now: Date,
  ctx: PopupContext = {}
): PopupCandidate | null {
  if (
    ctx.inOnboarding ||
    ctx.inFocus ||
    ctx.dialogOpen ||
    ctx.shownThisSession
  ) {
    return null;
  }

  const nowMs = now.getTime();
  const sinceSignup = nowMs - user.signedUpAt.getTime();
  const last = lastShownAt(history);

  const eligible = candidates.filter((c) => {
    if (c.source !== "trial" && sinceSignup < POPUP_QUIET_AFTER_SIGNUP_MS) {
      return false;
    }
    if (c.source === "announcement" && !user.productUpdates) return false;

    switch (c.source) {
      case "limit":
        // Ruling (Needt main, 22.11.2026): a limit hit bypasses the 3-day cap
        // (the person was just blocked) but repeats at most once per 7 days.
        return !shownBefore(history, "limit", c.key, nowMs - LIMIT_REPEAT_MS);
      case "trial":
        // Ruling (Needt main, 22.11.2026): each trial moment shows at most
        // once and bypasses the 3-day cap, so "3 days left" and "1 day left"
        // (two days apart) can both land.
        return !shownBefore(history, "trial", c.key, null);
      case "announcement":
        if (shownBefore(history, "announcement", c.key, null)) return false;
        return last === null || nowMs - last >= POPUP_CAP_MS;
      default:
        return last === null || nowMs - last >= POPUP_CAP_MS;
    }
  });

  if (eligible.length === 0) return null;
  return (
    [...eligible].sort(
      (a, b) =>
        SOURCE_RANK[a.source] - SOURCE_RANK[b.source] ||
        b.priority - a.priority ||
        a.key.localeCompare(b.key)
    )[0] ?? null
  );
}
