"use client";

import { useEffect, useState } from "react";

import { WifiOff } from "lucide-react";

import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { useAppSession } from "@/components/providers/app-session-context";

import {
  clearIfSignedOut,
  clearNeedtOfflineData,
  setNeedtOfflineScope,
} from "@/lib/pwa/offline-client";

type QueueState =
  | "idle"
  | "pending"
  | "syncing"
  | "retry"
  | "conflict"
  | "sign_in_required"
  | "forbidden"
  | "rejected";

export function PWARegister() {
  const { data: session, status } = useAppSession();
  const { activeWorkspace } = useWorkspace();
  const [isOffline, setIsOffline] = useState(false);
  const [queueState, setQueueState] = useState<QueueState>("idle");
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean(
        (window.navigator as Navigator & { standalone?: boolean }).standalone
      );
    document.documentElement.dataset.displayMode = standalone
      ? "standalone"
      : "browser";

    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      if (
        process.env.NODE_ENV === "development" &&
        process.env.NEXT_PUBLIC_PWA_IN_DEV !== "1"
      ) {
        // A production service worker caching dev chunks leaves localhost on a
        // stale client bundle after HMR/reload and can manufacture hydration
        // mismatches that do not exist in the current source.
        void navigator.serviceWorker
          .getRegistrations()
          .then((registrations) =>
            Promise.all(
              registrations.map((registration) => registration.unregister())
            )
          )
          .catch(() => undefined);
      } else {
        void navigator.serviceWorker
          .register("/sw.js", { updateViaCache: "none" })
          .then(async (registration) => {
            await registration.update();
            window.dispatchEvent(new Event("needt-service-worker-ready"));
          })
          .catch(() => undefined);
      }
    }

    const updateOnline = () => {
      if (typeof navigator === "undefined") return;
      const offline = !navigator.onLine;
      setIsOffline(offline);
      if (!offline && navigator.serviceWorker) {
        navigator.serviceWorker.controller?.postMessage({
          type: "NEEDT_SYNC_NOW",
        });
      }
    };
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const handleWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type !== "NEEDT_OFFLINE_STATE") return;
      setQueueState(event.data.state || "idle");
      setQueueCount(Number(event.data.count) || 0);
    };
    navigator.serviceWorker.addEventListener("message", handleWorkerMessage);
    return () =>
      navigator.serviceWorker.removeEventListener(
        "message",
        handleWorkerMessage
      );
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (status === "unauthenticated" || !userId) {
      /* Offline, the session check fails the same way a signed-out one
         does, and clearing then would throw away changes saved offline. */
      if (status !== "unauthenticated") return;
      if (navigator.onLine) {
        void clearNeedtOfflineData();
        return;
      }
      /* Back online, the cleanup runs once the server confirms there is no
         session; a session that only looked absent offline keeps its data. */
      const retryCleanup = () => {
        void clearIfSignedOut();
      };
      window.addEventListener("online", retryCleanup, { once: true });
      return () => window.removeEventListener("online", retryCleanup);
    }

    let cancelled = false;
    const configureScope = async () => {
      try {
        const previousUserId = localStorage.getItem("needt-offline-user-id");
        if (previousUserId && previousUserId !== userId) {
          await clearNeedtOfflineData();
        }
        localStorage.setItem("needt-offline-user-id", userId);
        const workspaceId = activeWorkspace?.workspace.id;
        if (!workspaceId || cancelled) return;
        await setNeedtOfflineScope({ userId, workspaceId });
        navigator.serviceWorker.controller?.postMessage({
          type: "NEEDT_OFFLINE_STATE_REQUEST",
        });
      } catch {
        // Offline storage stays disabled until identity and workspace are known.
      }
    };
    void configureScope();
    window.addEventListener("needt-service-worker-ready", configureScope);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      configureScope
    );
    return () => {
      cancelled = true;
      window.removeEventListener("needt-service-worker-ready", configureScope);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        configureScope
      );
    };
  }, [activeWorkspace?.workspace.id, session?.user?.id, status]);

  if (!isOffline && queueState === "idle") return null;

  const message = isOffline
    ? queueCount > 0
      ? `${queueCount} change${queueCount === 1 ? "" : "s"} saved locally.`
      : "Offline. Reconnect to sync changes."
    : queueState === "syncing" || queueState === "pending"
      ? `Syncing ${queueCount} saved change${queueCount === 1 ? "" : "s"}…`
      : queueState === "conflict"
        ? "A saved change conflicts with newer data. Review it before retrying."
        : queueState === "sign_in_required" || queueState === "forbidden"
          ? "Sign in again to sync saved changes."
          : queueState === "rejected"
            ? "A saved change needs attention before it can sync."
            : "Saved changes will retry automatically.";

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs shadow-lg">
      <WifiOff className="h-4 w-4 text-[var(--color-warning)]" />
      {message}
    </div>
  );
}
