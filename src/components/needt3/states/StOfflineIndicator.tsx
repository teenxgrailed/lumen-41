"use client";

import { useEffect, useRef, useState } from "react";

import { FiCloudOff } from "react-icons/fi";

import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { useAppSession } from "@/components/providers/app-session-context";

import {
  OFFLINE_SCHEMA_VERSION,
  setNeedtOfflineScope,
} from "@/lib/pwa/offline-client";

import strings from "../../../../docs/port/prototype/port/strings/en.json";
import { useDesignV3 } from "../root/V3Root";
import { offlineCount } from "./status";

const copy = strings["states.jsx"].StOfflineIndicator;

function waitingLabel(n: number) {
  return `${n} ${n === 1 ? "change" : "changes"} waiting`;
}

/** The top-bar "offline" pill and its popover (states.jsx `StOfflineIndicator`). */
export function StOfflineIndicator() {
  const enabled = useDesignV3();
  const { data: session } = useAppSession();
  const { activeWorkspace } = useWorkspace();
  const userId = session?.user?.id;
  const workspaceId = activeWorkspace?.workspace.id;
  // Same key the service worker builds for its active scope (public/sw.js).
  const scopeKey =
    userId && workspaceId
      ? `${OFFLINE_SCHEMA_VERSION}:${userId}:${workspaceId}`
      : null;
  const [offline, setOffline] = useState(false);
  const [queue, setQueue] = useState<{
    scopeKey: string | null;
    count: number | null;
  }>({ scopeKey: null, count: null });
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const read = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine) setOpen(false);
    };
    read();
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
    };
  }, []);

  useEffect(() => {
    setQueue({ scopeKey, count: null });
    setOpen(false);
    if (
      !enabled ||
      !userId ||
      !workspaceId ||
      !scopeKey ||
      !("serviceWorker" in navigator)
    )
      return;
    let active = true;
    const serviceWorker = navigator.serviceWorker;
    const receive = (event: MessageEvent) => {
      if (!active) return;
      const count = offlineCount(event.data, scopeKey);
      if (count !== undefined) setQueue({ scopeKey, count });
    };
    serviceWorker.addEventListener("message", receive);
    void setNeedtOfflineScope({ userId, workspaceId })
      .then(() => {
        if (!active) return;
        serviceWorker.controller?.postMessage({
          type: "NEEDT_OFFLINE_STATE_REQUEST",
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
      serviceWorker.removeEventListener("message", receive);
    };
  }, [enabled, userId, workspaceId, scopeKey]);

  useEffect(() => {
    if (!open) return;
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

  if (!enabled || !offline) return null;
  // A count is shown only once the worker reported one for this scope.
  const n = queue.scopeKey === scopeKey && queue.count ? queue.count : 0;
  const known = queue.scopeKey === scopeKey && queue.count !== null;
  return (
    <span className="state-offline-indicator-row" ref={wrap}>
      <button
        type="button"
        className="st-offline nx-press"
        data-st-offline
        aria-expanded={open}
        title={
          n
            ? `${n} ${copy.changes_will_sync_when_youre_back_online}`
            : copy.youre_offline_edits_still_save
        }
        onClick={() => setOpen((value) => !value)}
      >
        <FiCloudOff size={14} aria-hidden />
        <span>offline{n ? ` · ${waitingLabel(n)}` : ""}</span>
      </button>
      {open ? (
        <div className="st-offline-pop nx-pop is-right" data-st-offline-pop>
          <div className="st-pop-title">
            {n ? waitingLabel(n) : known ? copy.nothing_waiting : "Offline"}
          </div>
          {/* //todo the prototype lists each queued change ("Edited Launch
              brief · 2 min ago"); the worker reports only a count, so the
              list waits for per-item labels in NEEDT_OFFLINE_STATE (S1). */}
          <div className="st-pop-foot">
            {copy.you_can_keep_working} {n ? copy.these_sync : copy.edits_sync}{" "}
            {copy.on_their_own_when_youre_back_online}
          </div>
        </div>
      ) : null}
    </span>
  );
}
