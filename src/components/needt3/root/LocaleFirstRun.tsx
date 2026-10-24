"use client";

import { useEffect, useRef } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { logger } from "@/lib/logger";
import { browserTimeZone, sendJson } from "@/lib/needt3/hooks/core";
import { type V3Settings, useSettings } from "@/lib/needt3/hooks/settings";
import { firstRunLocalePatch } from "@/lib/needt3/locale-defaults";
import { qk } from "@/lib/needt3/query-keys";

const LOG_SOURCE = "LocaleFirstRun";

/**
 * Once per account: a zone still at the UTC default becomes the browser's,
 * with the language's week start and clock (`firstRunLocalePatch`). Silent —
 * no toast, no undo: the person never chose the value being replaced, and
 * `prefs.tzAutoSet` keeps it from ever running again.
 */
export function LocaleFirstRun() {
  const qc = useQueryClient();
  const { data } = useSettings();
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !data) return;
    started.current = true;
    const patch = firstRunLocalePatch(data, {
      timeZone: browserTimeZone(),
      language: typeof navigator === "undefined" ? null : navigator.language,
    });
    if (!patch) return;
    // In the cache first, so any prefs write merged meanwhile keeps the flag.
    qc.setQueryData<V3Settings>(qk.settings(), (cur) =>
      cur ? { ...cur, ...patch } : cur
    );
    sendJson("/api/user-settings", "PATCH", patch)
      .catch((error: unknown) => {
        logger.warn(
          "First-run time zone not saved",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
      })
      .finally(() => {
        void qc.invalidateQueries({ queryKey: qk.settings() });
      });
  }, [data, qc]);

  return null;
}
