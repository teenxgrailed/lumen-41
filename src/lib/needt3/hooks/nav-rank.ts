"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import {
  type NavId,
  applyPendingPatch,
  effectiveOrder,
  firstDayQuiet,
  pickTip,
  pinnedFrom,
  rankedPlaces,
  togglePin,
  undoReorderPatch,
  utcToday,
  withMailRule,
} from "@/lib/needt3/nav-rank";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { sendJson } from "./core";
import { usePlan } from "./plan";
import { type V3Settings, useSetPrefs, useSettings } from "./settings";

const LOG_SOURCE = "nav-rank";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/* ---------- the order of this load ---------- */

/*
 * The order is read once per load of the app (as soon as the settings are
 * known) and then held: a ranking that lands while the app is open waits for
 * the next fresh load, so nothing moves under the person's finger. Undo
 * changes it in place, and a plan change moves Mailbox alone. Everything is
 * kept per account, so signing in as someone else starts over.
 */
interface Held {
  user: string;
  /** The order before the Free Mailbox rule. */
  base: NavId[];
  pins: NavId[];
  free: boolean;
  order: NavId[];
  applied: boolean;
  tipped: boolean;
}

let state: Held | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Tests only. */
export function resetHeldNavOrder() {
  state = null;
  lastOpen = null;
  emit();
}

function heldFor(
  user: string,
  prefs: Record<string, unknown>,
  free: boolean
): Held {
  if (state && state.user === user) {
    if (state.free !== free) {
      // The plan changed mid-session: only Mailbox may move. No emit here:
      // this runs during render, and every reader re-renders on the plan.
      state = {
        ...state,
        free,
        order: withMailRule(state.base, state.pins, free),
      };
    }
    return state;
  }
  const base = effectiveOrder(prefs);
  const pins = pinnedFrom(prefs);
  state = {
    user,
    base,
    pins,
    free,
    order: withMailRule(base, pins, free),
    applied: false,
    tipped: false,
  };
  return state;
}

/**
 * The ranked list both the phone pill and the desktop sidebar read. Held from
 * the moment the settings load; until then it is the default order. A plan
 * that is unknown or failed to load counts as paid.
 */
export function useRankedPlaces(): NavId[] {
  const settings = useSettings();
  const plan = usePlan();
  useSyncExternalStore(
    subscribe,
    () => state,
    () => null
  );
  if (!settings.data) return rankedPlaces({});
  const user = settings.data.userId ?? "";
  return heldFor(user, settings.data.prefs, plan.data?.kind === "free").order;
}

/** Pins, as stored, and a toggle that writes them. */
export function useNavPins(): {
  pinned: NavId[];
  toggle: (id: NavId) => Promise<unknown>;
  ready: boolean;
} {
  const qc = useQueryClient();
  const settings = useSettings();
  const setPrefs = useSetPrefs();
  return {
    pinned: pinnedFrom(settings.data?.prefs),
    ready: !!settings.data,
    toggle: (id) => {
      const cur = qc.getQueryData<V3Settings>(qk.settings());
      if (!cur) return Promise.resolve(undefined);
      return setPrefs({ navPinned: togglePin(cur.prefs, id) }).catch(
        (error) => {
          logger.error(
            "Could not save a pin",
            { error: errorText(error) },
            LOG_SOURCE
          );
          return undefined;
        }
      );
    },
  };
}

/* ---------- opens, the pending order, the tips ---------- */

const RECORD_AFTER_MS = 1200;
/** The same place opened again within this long counts once. */
const SAME_OPEN_MS = 30_000;

let lastOpen: { id: NavId; at: number } | null = null;

/** Count one open (the same place twice within 30 s counts once). */
export function recordPlaceOpen(id: NavId) {
  const now = newDate().getTime();
  if (lastOpen && lastOpen.id === id && now - lastOpen.at < SAME_OPEN_MS)
    return;
  lastOpen = { id, at: now };
  void sendJson("/api/nav/usage", "POST", { place: id }).catch((error) =>
    // A lost count only delays a ranking.
    logger.error(
      "Could not count a place open",
      { error: errorText(error) },
      LOG_SOURCE
    )
  );
}

/**
 * Mounted once by the shell (desktop and phone). It applies a pending order
 * on the first load that sees it, shows at most one tip per load, and counts
 * the place on show once it has stayed a moment. `place` is the place on
 * show (null: not a place), `askOpen` whether Ask Needt is open;
 * `openSettings` opens where pins are changed.
 *
 * The apply and the tip go out as one write, and the tip shows only once
 * that write has landed: a write that fails shows nothing, so a tip never
 * repeats on every load.
 */
export function useNavRankEffects(
  place: NavId | null,
  askOpen: boolean,
  openSettings: () => void
) {
  const settings = useSettings();
  const setPrefs = useSetPrefs();
  const qc = useQueryClient();
  const openRef = useRef(openSettings);
  openRef.current = openSettings;
  const setRef = useRef(setPrefs);
  setRef.current = setPrefs;

  const data = settings.data;
  useEffect(() => {
    if (!data) return;
    const held = heldFor(data.userId ?? "", data.prefs, state?.free ?? false);
    if (held.applied && held.tipped) return;
    const day = utcToday();
    let base: Record<string, unknown> = data.prefs;
    const patch: Record<string, unknown> = {};
    if (!held.applied) {
      held.applied = true;
      const apply = applyPendingPatch(base, day);
      if (apply) {
        Object.assign(patch, apply);
        base = { ...base, ...apply };
      }
    }
    let pick: ReturnType<typeof pickTip> = null;
    if (!held.tipped) {
      held.tipped = true;
      if (!firstDayQuiet(data.createdAt, day)) pick = pickTip(base, day);
      if (pick) Object.assign(patch, pick.patch);
    }
    if (!Object.keys(patch).length) return;
    void setRef
      .current(patch)
      .then(() => {
        if (pick) showTip(pick);
      })
      .catch((error) =>
        logger.error(
          "Could not apply the menu order or mark its tip",
          { error: errorText(error) },
          LOG_SOURCE
        )
      );

    function showTip(tip: NonNullable<typeof pick>) {
      const toSettings = {
        label: "Change in Settings",
        onClick: () => openRef.current(),
      };
      if (tip.kind === "tip") {
        notify.info(tip.tip.title, {
          surface: "island",
          description: tip.tip.body,
          actions: [toSettings],
        });
        return;
      }
      notify.info(`We moved ${navWord(tip.moved)} up`, {
        surface: "island",
        description: "Because you use it most. Pinned places never move.",
        actions: [
          {
            label: "Undo",
            onClick: () => {
              const cur = qc.getQueryData<V3Settings>(qk.settings());
              const undo = cur && undoReorderPatch(cur.prefs, newDate());
              if (!cur || !undo || !state) return;
              const next = { ...cur.prefs, ...undo };
              state = {
                ...state,
                base: effectiveOrder(next),
                pins: pinnedFrom(next),
                order: rankedPlaces(next, { free: state.free }),
              };
              emit();
              void setRef
                .current(undo)
                .catch((error) =>
                  logger.error(
                    "Could not undo the menu order",
                    { error: errorText(error) },
                    LOG_SOURCE
                  )
                );
            },
          },
          toSettings,
        ],
      });
    }
  }, [data, qc]);

  /* Count the place on show once it has stayed a moment. */
  useEffect(() => {
    if (!place) return undefined;
    const t = window.setTimeout(() => recordPlaceOpen(place), RECORD_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [place]);

  /* Ask Needt is not a route: each opening counts. */
  useEffect(() => {
    if (askOpen) recordPlaceOpen("ask");
  }, [askOpen]);
}

const WORDS: Record<NavId, string> = {
  today: "Home",
  calendar: "Calendar",
  tasks: "Tasks",
  docs: "Docs",
  mail: "Mailbox",
  ask: "Ask Needt",
  projects: "Projects",
  goals: "Goals",
  moodboards: "Moodboards",
  habits: "Habits",
  templates: "Templates",
  shared: "Shared",
  trash: "Trash",
};

/** A place's name in a sentence. */
export function navWord(id: NavId): string {
  return WORDS[id];
}
