"use client";

import { useEffect, useState } from "react";

import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { useAppSession } from "@/components/providers/app-session-context";

import {
  OFFLINE_SCHEMA_VERSION,
  setNeedtOfflineScope,
} from "@/lib/pwa/offline-client";

import { useDesignV3 } from "../root/V3Root";
import { offlineCount } from "./status";

/**
 * The browser's connection and the service worker's count of queued writes
 * for the active user and workspace. `queued` is null until the worker has
 * reported one for this scope.
 */
export function useOfflineQueue() {
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
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<{
    scopeKey: string | null;
    count: number | null;
  }>({ scopeKey: null, count: null });

  useEffect(() => {
    const read = () => setOnline(navigator.onLine);
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

  const queued = queue.scopeKey === scopeKey ? queue.count : null;
  return { online, queued };
}
