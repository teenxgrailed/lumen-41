"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { newDate } from "@/lib/date-utils";

import { useOfflineQueue } from "../states/useOfflineQueue";
import { type SyncKind, deriveSyncStatus } from "./status";
import { useSyncSource } from "./sync-source";
import { useMutationHealth } from "./useMutationHealth";

/** How long "Saved" stays up after a save before only the dot is left. */
export const SAVED_WORD_MS = 3500;

function clock(at: number) {
  return newDate(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The one sync status, in the top bar of every screen (desktop and phone): a
 * small dot and one word. Saved is quiet and fades to the dot; Syncing…,
 * Offline (n changes waiting) and the error states stay up. Click opens the
 * details, and Retry when there is something to retry. The accent is a mark
 * only, never a fill.
 */
export function SyncStatus({
  placement = "bar",
}: {
  placement?: "bar" | "phone";
}) {
  const { online, queued } = useOfflineQueue();
  const {
    mutating,
    failedMutations,
    retry: retryMutations,
  } = useMutationHealth();
  const source = useSyncSource();
  const view = useMemo(
    () =>
      deriveSyncStatus({
        online,
        queued,
        mutating,
        failedMutations,
        source,
      }),
    [online, queued, mutating, failedMutations, source]
  );

  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const [quiet, setQuiet] = useState(true);
  const [savedAt, setSavedAt] = useState(() => newDate().getTime());
  const previous = useRef<SyncKind>(view.kind);

  useEffect(() => {
    if (view.kind !== "saved") {
      setQuiet(false);
      previous.current = view.kind;
      return undefined;
    }
    // Coming back to Saved from something else: say the word, then fade it.
    if (previous.current !== "saved") setSavedAt(newDate().getTime());
    const justSaved = previous.current !== "saved";
    previous.current = "saved";
    if (!justSaved) return undefined;
    setQuiet(false);
    const id = window.setTimeout(() => setQuiet(true), SAVED_WORD_MS);
    return () => window.clearTimeout(id);
  }, [view.kind]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const retry = () => {
    source?.retry?.();
    retryMutations();
  };
  const hideWord = view.kind === "saved" && quiet && !open;

  return (
    <span
      ref={wrap}
      className={`sync-status-row${placement === "phone" ? " is-phone" : ""}`}
    >
      <button
        type="button"
        className="sync-status nx-press"
        data-sync-status={view.kind}
        data-sync-quiet={hideWord ? "" : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Sync status: ${view.title}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="sync-status-dot" aria-hidden="true" />
        <span className="sync-status-word" aria-live="polite">
          {view.label}
        </span>
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Sync details"
          className="st-offline-pop sync-status-pop nx-pop is-right"
          data-sync-pop
        >
          <div className="st-pop-title">{view.title}</div>
          <div className="sync-status-lines">
            {view.waiting ? <div>{view.waiting}</div> : null}
            <div>{view.detail}</div>
            <div className="sync-status-muted">Last saved {clock(savedAt)}</div>
          </div>
          {view.retryable ? (
            <div className="sync-status-actions">
              <button
                type="button"
                className="nx-btn nx-btn-secondary nx-btn-sm"
                data-sync-retry=""
                onClick={retry}
              >
                Retry
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}
