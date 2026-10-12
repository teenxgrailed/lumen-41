"use client";

import { useCallback, useEffect, useRef } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

import { sendJson } from "./core";

/** The worker needs a moment; the list is read again after it. */
const REFRESH_AFTER_MS = 5000;

/**
 * Ask the worker to sync the mail accounts (`POST /api/mail/sync`). The
 * route only queues a job and answers `{ queued }`, so the mail list is
 * refreshed once now and again a few seconds later, when the job has run.
 * The timer is cleared on unmount.
 */
export function useMailSync() {
  const qc = useQueryClient();
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    },
    []
  );
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: qk.mail() });
  }, [qc]);
  return useMutation<{ queued: number }, Error, void>({
    mutationFn: () =>
      sendJson<{ queued: number }>("/api/mail/sync", "POST", {}),
    onSuccess: ({ queued }) => {
      if (!queued) return;
      refresh();
      if (timer.current != null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(refresh, REFRESH_AFTER_MS);
    },
  });
}
