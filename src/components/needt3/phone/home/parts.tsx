"use client";

import { type ReactNode, useState } from "react";

import { cappedCount } from "../../home/derive";
import { StError } from "../../states/StScreen";
import { StSkeleton } from "../../states/StSkeleton";
import { type ScreenQuery, errorText, screenState } from "../../states/status";
import { PkButton } from "../kit";

/**
 * A section's rows, capped like the desktop's (25, with a small overflow
 * shown in full): a quiet "Show all N" under a long list, so a phone with 500
 * tasks stays fast and nothing is hidden without a way to see it.
 */
export function CappedRows<T extends { id: string }>({
  list,
  render,
}: {
  list: readonly T[];
  render: (item: T) => ReactNode;
}) {
  const [all, setAll] = useState(false);
  const { over, shown } = cappedCount(list.length, all);
  return (
    <>
      {list.slice(0, shown).map(render)}
      {over ? (
        <PkButton
          kind="chip"
          className="p5-more"
          data-p5-more={all ? "less" : "all"}
          onClick={() => setAll(!all)}
        >
          {all ? "Show fewer" : `Show all ${list.length}`}
        </PkButton>
      ) : null}
    </>
  );
}

/**
 * What a phone screen shows in place of its body while its query has nothing
 * to show (states.jsx, via the same `screenState` as `StScreen`): the
 * skeleton on first load, the error with Retry, the offline line. The screen's
 * own header stays; cached content always wins. Returns null with content.
 */
export function PhoneState({
  query,
  screen,
  kind = "list",
}: {
  query: ScreenQuery;
  screen: string;
  kind?: "list" | "calendar";
}) {
  const state = screenState(query);
  if (state === "content") return null;
  if (state === "loading")
    return (
      <div className="p5-state" data-p5-state="loading" aria-busy="true">
        <StSkeleton kind={kind} />
      </div>
    );
  return (
    <div className="p5-state" data-p5-state={state}>
      <StError
        text={
          state === "offline"
            ? "You’re offline — reconnect to load this."
            : errorText(screen)
        }
        onRetry={query.refetch}
      />
    </div>
  );
}

/** True when the screen should draw its body (the query has content). */
export const hasContent = (query: ScreenQuery) =>
  screenState(query) === "content";
