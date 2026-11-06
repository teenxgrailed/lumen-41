"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSetPref, useSettings } from "@/lib/needt3/hooks/settings";

import type { CnItem } from "./derive";
import { SETUP_PREF, setupRunKey, setupSeenKey } from "./setup-keys";

/*
 * The first visit to Connections ("Connect your day", owner 05.11.26): pick
 * sources on a field of tiles, connect them one at a time through the flows
 * the cards already use, then a done screen. Design reference:
 * Needt - Design/needt-app/additions-4/agents-variants/connections-setup.html.
 *
 * It opens by itself while a person has nothing connected and has not
 * skipped or finished it; "Set up" in the hero opens it again. Whether it was
 * skipped or finished is the person's setting (`prefs.connectionsSetup`, on
 * the server), so it holds across sign-outs and devices. Connecting leaves
 * the page for the provider, so the run (step and picks) lives in
 * sessionStorage under the person's id, and the screen comes back to step 2
 * on return; what is connected is read from the real cards, never the run.
 */

export {
  SETUP_PREF,
  SETUP_RUN_KEY,
  SETUP_SEEN_SESSION_KEY,
  setupRunKey,
  setupSeenKey,
} from "./setup-keys";

export type SetupStep = 1 | 2 | 3;

export interface SetupRun {
  step: SetupStep;
  /** Card slugs picked on step 1, in tile order. */
  picked: string[];
  /** Slugs skipped on step 2. */
  skipped: string[];
}

/** The tiles step 1 leads with, the prototype's order; then the rest. */
const PREFERRED = [
  "google-calendar",
  "gmail",
  "icloud-calendar",
  "googledrive",
  "notion",
  "linear",
  "todoist",
  "github",
  "figma",
  "spotify",
  "dropbox",
  "zoom",
  "outlook-calendar",
  "outlook-mail",
  "google-tasks",
  "slack",
];
/** Picked when the setup opens: a calendar, mail and Apple. */
const DEFAULT_PICKS = ["google-calendar", "gmail", "icloud-calendar"];
/** Not a source a person connects on the first day. */
const NOT_A_SOURCE = new Set(["needt-api"]);
export const MAX_TILES = 12;

/** One tile per source (several accounts of one provider are one tile). */
export function setupSources(items: readonly CnItem[]): CnItem[] {
  const bySlug = new Map<string, CnItem>();
  for (const i of items)
    if (!NOT_A_SOURCE.has(i.slug) && !bySlug.has(i.slug)) bySlug.set(i.slug, i);
  const rank = (slug: string) => {
    const k = PREFERRED.indexOf(slug);
    return k < 0 ? PREFERRED.length : k;
  };
  return [...bySlug.values()]
    .map((item, at) => ({ item, at }))
    .sort((a, b) => rank(a.item.slug) - rank(b.item.slug) || a.at - b.at)
    .slice(0, MAX_TILES)
    .map((x) => x.item);
}

/** Rows of the field: widest in the middle of the top, 5 / 4 / 3 at twelve. */
export function setupRows(n: number): number[] {
  if (n <= 0) return [];
  if (n <= 5) return [n];
  if (n <= 9) return [Math.ceil(n / 2), Math.floor(n / 2)];
  const a = Math.ceil(n / 3) + 1;
  const b = Math.ceil((n - a) / 2);
  return [a, b, n - a - b];
}

/** How far a tile sits from the centre, 0..1: the edge ones fade and blur. */
export function tileDepth(
  col: number,
  cols: number,
  row: number,
  rows: number
) {
  const x = (col - (cols - 1) / 2) / 3.2;
  const y = rows > 1 ? (row - (rows - 1) / 2) / 1.9 : 0;
  return Math.min(1, Math.sqrt(x * x + y * y));
}

export function defaultPicks(sources: readonly CnItem[]): string[] {
  const have = new Set(sources.map((s) => s.slug));
  return DEFAULT_PICKS.filter((s) => have.has(s));
}

export type SourceStatus = "done" | "skipped" | "active" | "queued";

/**
 * Where each picked source stands on step 2: connected (any card of its slug
 * is), skipped, the one to connect now (the first left), or up next.
 */
export function setupStatuses(
  run: Pick<SetupRun, "picked" | "skipped">,
  items: readonly Pick<CnItem, "slug" | "state">[]
): Record<string, SourceStatus> {
  const live = new Set(
    items.filter((i) => i.state === "connected").map((i) => i.slug)
  );
  const out: Record<string, SourceStatus> = {};
  let active = false;
  for (const slug of run.picked) {
    if (live.has(slug)) out[slug] = "done";
    else if (run.skipped.includes(slug)) out[slug] = "skipped";
    else if (!active) {
      out[slug] = "active";
      active = true;
    } else out[slug] = "queued";
  }
  return out;
}

/** Opens by itself: the cards are in, nothing is connected, never dismissed. */
export function shouldAutoOpen(
  items: readonly Pick<CnItem, "state">[],
  loaded: boolean,
  seen: string | null
) {
  return loaded && !seen && items.every((i) => i.state === "none");
}

/** "Gmail", "Gmail and Drive", "Gmail, Drive and Notion". */
export function listNames(names: readonly string[]) {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeSession(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* private mode: the setting on the server is all there is */
  }
}

function readRun(key: string): SetupRun | null {
  try {
    const v = window.sessionStorage.getItem(key);
    const saved = v ? (JSON.parse(v) as Partial<SetupRun>) : null;
    if (!saved || !Array.isArray(saved.picked)) return null;
    return {
      step: saved.step === 3 ? 3 : saved.step === 2 ? 2 : 1,
      picked: saved.picked.filter((x) => typeof x === "string"),
      skipped: Array.isArray(saved.skipped)
        ? saved.skipped.filter((x) => typeof x === "string")
        : [],
    };
  } catch {
    return null;
  }
}
function writeRun(key: string, run: SetupRun | null) {
  try {
    if (run) window.sessionStorage.setItem(key, JSON.stringify(run));
    else window.sessionStorage.removeItem(key);
  } catch {
    /* private mode: the run lasts until reload */
  }
}

/**
 * The setup's state over the connections controller's cards. `run` is null
 * while it is closed. Nothing opens or comes back until both the cards and
 * the person's settings are in, so step 2 never draws against an empty list.
 */
export function useConnectionsSetup(items: readonly CnItem[], loaded: boolean) {
  const settings = useSettings();
  const setPref = useSetPref();
  const userId = settings.data?.userId;
  const seen = settings.data?.prefs?.[SETUP_PREF];
  const ready = loaded && !!settings.data;
  const key = setupRunKey(userId);
  const [run, setRunState] = useState<SetupRun | null>(null);
  const checked = useRef(false);
  const sources = useMemo(() => setupSources(items), [items]);

  const setRun = useCallback(
    (next: SetupRun | null) => {
      setRunState(next);
      writeRun(key, next);
    },
    [key]
  );

  // A run in progress (back from a provider) comes back first; otherwise the
  // setup opens if nothing is connected and it was never dismissed.
  useEffect(() => {
    if (checked.current || !ready) return;
    checked.current = true;
    const saved = readRun(key);
    if (saved) return setRunState(saved);
    const said =
      typeof seen === "string" ? seen : readSession(setupSeenKey(userId));
    if (shouldAutoOpen(items, ready, said))
      setRunState({ step: 1, picked: defaultPicks(sources), skipped: [] });
  }, [ready, key, items, sources, seen, userId]);

  /**
   * Saves the dismissal to the person's settings, once more after a second
   * if the first write fails; this session also notes it, so a write that
   * fails twice still does not bring the setup back on the next load.
   */
  const remember = useCallback(
    (why: "skipped" | "done") => {
      writeSession(setupSeenKey(userId), why);
      void setPref(SETUP_PREF, why).catch(
        () =>
          new Promise((done) =>
            window.setTimeout(
              () => void setPref(SETUP_PREF, why).then(done, done),
              1000
            )
          )
      );
    },
    [setPref, userId]
  );
  const open = useCallback(
    () => setRun({ step: 1, picked: defaultPicks(sources), skipped: [] }),
    [setRun, sources]
  );
  /** Closes it for good: it does not open by itself again. */
  const close = useCallback(
    (why: "skipped" | "done") => {
      remember(why);
      setRun(null);
    },
    [remember, setRun]
  );
  /** "Skip for now" on step 1: remembered, so it does not open by itself. */
  const skip = useCallback(() => remember("skipped"), [remember]);

  return { run, setRun, sources, open, restart: open, skip, close };
}

export type ConnectionsSetupState = ReturnType<typeof useConnectionsSetup>;
