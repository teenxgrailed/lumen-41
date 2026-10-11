"use client";

import type { ReactNode } from "react";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import { type ScreenQuery, errorText, screenState } from "../../states/status";
import { PkButton, PkEmpty } from "../kit";

const copy = strings["states.jsx"];

export const OFFLINE_TEXT = "You’re offline — reconnect to load this.";

const LOADING: Record<string, string> = {
  habits: "Loading your habits…",
  moodboards: "Loading your moodboards…",
};

/**
 * The phone's data states for a place's body: first load, error + retry,
 * offline with nothing cached, and no access. The same decision as the
 * desktop's `StScreen` (`screenState`: cached content always wins, except
 * after a 403) in the phone kit's own quiet empty block, because `StScreen`
 * lays a full-screen layer over the nearest positioned box, which on the
 * phone would hide the title. //todo: swap for P4's phone states layer when
 * it lands.
 */
export function PlaceState({
  query,
  screen,
  children,
}: {
  query: ScreenQuery;
  screen: string;
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
        data-phb-state="loading"
      >
        <PkEmpty sky={false} line={LOADING[screen] ?? "Loading…"} />
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
    <div role="alert" data-phb-state={state}>
      <PkEmpty
        sky={false}
        title={state === "offline" ? "Offline" : "Couldn’t load"}
        line={state === "offline" ? OFFLINE_TEXT : errorText(screen)}
        action={
          <PkButton kind="chip" onClick={() => void query.refetch()}>
            {copy.StError.retry}
          </PkButton>
        }
      />
    </div>
  );
}
