"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { newDate, toLocalDateKey } from "@/lib/date-utils";
import {
  type NavId,
  applyPendingPatch,
  firstDayQuiet,
  pickTip,
  pinnedFrom,
  rankedPlaces,
  togglePin,
  undoReorderPatch,
} from "@/lib/needt3/nav-rank";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { sendJson } from "./core";
import { usePlan } from "./plan";
import { type V3Settings, useSetPrefs, useSettings } from "./settings";

/* ---------- the order of this load ---------- */

/*
 * The order is read once per load of the app and then held: a ranking that
 * lands while the app is open waits for the next fresh load, so nothing moves
 * under the person's finger. Only Undo changes it in place.
 */
let held: NavId[] | null = null;
let heldFree: boolean | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Tests only. */
export function resetHeldNavOrder() {
  held = null;
  heldFree = undefined;
  applied = false;
  tipped = false;
  emit();
}

/**
 * The ranked list both the phone pill and the desktop sidebar read. Until the
 * prefs and the plan are known it is the default order (not held).
 */
export function useRankedPlaces(): NavId[] {
  const settings = useSettings();
  const plan = usePlan();
  const snap = useSyncExternalStore(
    subscribe,
    () => held,
    () => null
  );
  const free = plan.data ? plan.data.kind === "free" : undefined;
  if (!settings.data || free === undefined) return rankedPlaces({});
  if (snap && heldFree === free) return snap;
  // First read on this load (or the plan changed): hold it.
  held = rankedPlaces(settings.data.prefs, { free });
  heldFree = free;
  return held;
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
        () => undefined
      );
    },
  };
}

/* ---------- opens, the pending order, the tips ---------- */

let applied = false;
let tipped = false;

const RECORD_AFTER_MS = 1200;

/** Count one open; quiet on failure (a lost count only delays a ranking). */
export function recordPlaceOpen(id: NavId) {
  void sendJson("/api/nav/usage", "POST", { place: id }).catch(() => undefined);
}

/**
 * Mounted once by the shell (desktop and phone). It applies a pending order on the first load that sees it, shows at most one
 * tip per load, and counts the place on show once it has stayed a moment.
 * `place` is the place on show (null: not a place), `askOpen` whether Ask
 * Needt is open; `openSettings` opens where pins are changed.
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

  /* The first load with prefs: apply a pending order, then maybe a tip. */
  const prefs = settings.data?.prefs;
  useEffect(() => {
    if (!prefs) return;
    const day = toLocalDateKey(newDate());
    let base = prefs;
    if (!applied) {
      applied = true;
      const patch = applyPendingPatch(prefs, day);
      if (patch) {
        base = { ...prefs, ...patch };
        void setPrefs(patch).catch(() => undefined);
      }
    }
    if (tipped) return;
    tipped = true;
    if (firstDayQuiet(settings.data?.createdAt, day)) return;
    const pick = pickTip(base, day);
    if (!pick) return;
    void setPrefs(pick.patch).catch(() => undefined);
    const toSettings = {
      label: "Change in Settings",
      onClick: () => openRef.current(),
    };
    if (pick.kind === "reorder") {
      notify.info(`We moved ${navWord(pick.moved)} up`, {
        surface: "island",
        description: "Because you use it most. Pinned places never move.",
        actions: [
          {
            label: "Undo",
            onClick: () => {
              const cur = qc.getQueryData<V3Settings>(qk.settings());
              const undo = cur && undoReorderPatch(cur.prefs, newDate());
              if (!undo) return;
              held = rankedPlaces(
                { ...cur.prefs, ...undo },
                { free: heldFree }
              );
              emit();
              void setPrefs(undo).catch(() => undefined);
            },
          },
          toSettings,
        ],
      });
    } else {
      notify.info(pick.tip.title, {
        surface: "island",
        description: pick.tip.body,
        actions: [toSettings],
      });
    }
  }, [prefs, setPrefs, qc, settings.data?.createdAt]);

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
