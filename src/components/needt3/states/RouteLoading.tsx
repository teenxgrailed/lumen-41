"use client";

import { usePathname } from "next/navigation";

import { StSkeleton } from "./StSkeleton";
import { routeSkeletonKind } from "./status";

/**
 * What a place shows from the tap until its page arrives: the skeleton of the
 * place being opened, inside the frame that is already on screen (the frame
 * belongs to the layout, so it never blinks). Mounted by `app/(app)/loading.tsx`.
 *
 * It is not a full-screen overlay (that was the old "Opening" card, removed
 * for flashing on every switch, 7602238). It is an ordinary block in the
 * page's own slot with no background, and CSS (`route-loading.css`) keeps it
 * invisible for the first 150 ms, so a switch that is quick never shows it and
 * a slow one shows the shape of the place instead of the old screen frozen.
 */
export function RouteLoading() {
  const kind = routeSkeletonKind(usePathname() ?? "");
  if (!kind) return null;
  return (
    <div
      className="st-route-loading"
      role="status"
      aria-live="polite"
      data-route-loading={kind}
    >
      <StSkeleton kind={kind} />
    </div>
  );
}
