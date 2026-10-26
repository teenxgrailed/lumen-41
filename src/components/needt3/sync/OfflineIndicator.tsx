"use client";

import { useEffect, useRef, useState } from "react";

import { StGlyph } from "../states/StGlyph";
import { useOfflineQueue } from "../states/useOfflineQueue";
import { useSyncSource } from "./sync-source";
import { useOnline } from "./useOnline";

function changes(n: number) {
  return `${n} ${n === 1 ? "change" : "changes"}`;
}

/**
 * The prototype's `StOfflineIndicator` (states.jsx), desktop top bar: nothing
 * at all while the app is online, a quiet pill with the cloud-off mark and the
 * count of waiting changes when it is not. It is the app-wide offline signal
 * on every screen that is not an editing surface; an open document, page or
 * board says "Offline — changes kept" through its own SyncStatus instead, so
 * the two never show together. (The phone's is `PhoneOfflineIndicator`.)
 */
export function OfflineIndicator() {
  const online = useOnline();
  const editing = useSyncSource() !== null;
  if (online || editing) return null;
  return <DeskPill />;
}

function DeskPill() {
  const { queued } = useOfflineQueue();
  const n = queued && queued > 0 ? queued : 0;
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);

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

  return (
    <span className="st-offline-row" ref={wrap}>
      <button
        type="button"
        className="st-offline nx-press"
        data-st-offline=""
        aria-expanded={open}
        aria-haspopup="dialog"
        title={
          n
            ? `${changes(n)} will sync when you're back online`
            : "You're offline — edits still save"
        }
        onClick={() => setOpen((value) => !value)}
      >
        <StGlyph name="cloud-off" size={14} />
        <span>offline{n ? ` · ${changes(n)} waiting` : ""}</span>
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Offline details"
          className="st-offline-pop nx-pop is-right"
          data-st-offline-pop=""
        >
          <div className="st-pop-title">
            {n ? `${changes(n)} waiting` : "Nothing waiting"}
          </div>
          <div className="st-pop-foot">
            You can keep working. {n ? "These sync" : "Edits sync"} on their own
            when you&apos;re back online.
          </div>
        </div>
      ) : null}
    </span>
  );
}
