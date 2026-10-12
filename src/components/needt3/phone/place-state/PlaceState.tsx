"use client";

import type { ReactNode } from "react";

import { StError } from "../../states/StScreen";
import { type SkeletonKind, StSkeleton } from "../../states/StSkeleton";
import {
  SCREEN_KIND,
  type ScreenQuery,
  errorText,
  screenState,
} from "../../states/status";
import { PkEmpty } from "../kit";

export const OFFLINE_TEXT = "You’re offline — reconnect to load this.";

/**
 * The phone's data states for a place's body: the skeleton on first load,
 * the error row with Retry, the offline row with nothing cached, and no
 * access. The same decision as the desktop's `StScreen` (`screenState`:
 * cached content always wins, except after a 403) and the same `StSkeleton` /
 * `StError`, drawn inside the screen's scroller because `StScreen` lays a
 * full-screen layer over the nearest positioned box, which on the phone would
 * hide the title. //todo: swap for P4's phone states layer when it lands.
 */
export function PlaceState({
  query,
  screen,
  kind,
  text,
  children,
}: {
  query: ScreenQuery;
  screen: string;
  /** Skeleton shape; defaults to the screen's kind in `SCREEN_KIND`. */
  kind?: SkeletonKind;
  /** The error row's words, when the screen name does not say it. */
  text?: string;
  children: ReactNode;
}) {
  const state = screenState(query);
  if (state === "content") return <>{children}</>;
  if (state === "loading")
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Loading"
        data-phb-state="loading"
      >
        <StSkeleton kind={kind ?? SCREEN_KIND[screen] ?? "list"} />
      </div>
    );
  if (state === "no-access")
    return (
      <div role="alert" data-phb-state="no-access">
        <PkEmpty
          sky={false}
          title="You don’t have access"
          line="Ask the owner to share it with you again."
        />
      </div>
    );
  return (
    <div data-phb-state={state}>
      <StError
        text={state === "offline" ? OFFLINE_TEXT : (text ?? errorText(screen))}
        onRetry={query.refetch}
      />
    </div>
  );
}
