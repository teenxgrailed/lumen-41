"use client";

import { useCallback, useState } from "react";

import type { StatsRange } from "@/services/stats/home-stats";

import { useStats } from "@/lib/needt3/hooks/stats";

/**
 * The stats state both Home faces share: the week for the small card, and the
 * full view's open state, range and (only while open) its own numbers. `bust`
 * is the count of closed tasks, so closing one asks again.
 */
export function useHomeStats(bust: number) {
  const week = useStats("week", bust);
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<StatsRange>("week");
  const full = useStats(range, bust, { enabled: open });
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  return {
    week: week.data,
    failed: week.isError,
    open,
    show,
    close,
    sheet: {
      stats: full.data,
      range,
      loading: full.isLoading,
      onRange: setRange,
    },
  };
}
