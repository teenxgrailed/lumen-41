"use client";

import { useCallback, useMemo } from "react";

import {
  HOME_BLOCKS_PREF,
  type HomeBlocks,
  homeBlocksOf,
} from "@/lib/needt3/home-blocks";

import { useSetPref, useSettings } from "./settings";

/**
 * Which blocks Home shows (`prefs.homeBlocks`): one setting for desktop and
 * phone, saved with the rest of the person's settings.
 */
export function useHomeBlocks(): HomeBlocks {
  const stored = useSettings().data?.prefs?.[HOME_BLOCKS_PREF];
  return useMemo(() => homeBlocksOf({ [HOME_BLOCKS_PREF]: stored }), [stored]);
}

/** Change some of it; the rest is kept. The new Home shows at once. */
export function useSetHomeBlocks() {
  const blocks = useHomeBlocks();
  const setPref = useSetPref();
  return useCallback(
    (patch: Partial<HomeBlocks>) =>
      setPref(HOME_BLOCKS_PREF, { ...blocks, ...patch }).catch(() => null),
    [blocks, setPref]
  );
}
