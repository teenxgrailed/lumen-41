"use client";

import { NeedtLoading } from "./NeedtLoading";

/**
 * What a place shows from the tap until its page arrives: the Needt word,
 * filling, in the page's own slot inside the frame that is already on screen
 * (the frame belongs to the layout, so it never blinks). Mounted by
 * `app/(app)/loading.tsx`.
 *
 * A route chunk reports no progress, so the word is in its eased mode: it
 * climbs toward 90% and is replaced by the page when that arrives.
 *
 * It is not a full-screen overlay (that was the old "Opening" card, removed
 * for flashing on every switch, 7602238). It is an ordinary block with no
 * background, and `needt-loading.css` keeps it invisible for the first 150 ms,
 * so a switch that is quick never shows it. It replaced the per-place
 * skeletons (owner, 15.11.26: one loading screen, the word); `StSkeleton`
 * stays for any caller that wants a shape.
 */
export function RouteLoading() {
  return <NeedtLoading />;
}
