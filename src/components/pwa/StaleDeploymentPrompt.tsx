"use client";

import { useEffect } from "react";

import { notify } from "@/lib/notifications";
import { NEW_VERSION_EVENT } from "@/lib/pwa/build-version";
import {
  type ChunkGuardWindow,
  installChunkReloadGuard,
} from "@/lib/pwa/chunk-reload";
import { staleDeploymentReason } from "@/lib/stale-deployment";

/**
 * Offers a reload when the page is from an older deploy: a server action
 * failed, the server reports a newer build, or a new worker took over.
 */
export function StaleDeploymentPrompt() {
  useEffect(() => {
    const prompt = () =>
      notify.info("Needt was updated", {
        description: "Reload to get the latest version.",
        dedupeKey: "stale-deployment",
        duration: 60_000,
        action: { label: "Reload", onClick: () => window.location.reload() },
      });

    const onRejection = (event: PromiseRejectionEvent) => {
      if (staleDeploymentReason(event.reason)) prompt();
    };
    const onError = (event: ErrorEvent) => {
      if (staleDeploymentReason(event.error ?? event.message)) prompt();
    };

    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    // The server answered from a newer build, or a new worker took over.
    window.addEventListener(NEW_VERSION_EVENT, prompt);
    // Also in the bundle: the inline script in the layout covers a page whose
    // bundle never loaded, this covers one that did and lazy-loads later.
    const offChunkGuard = installChunkReloadGuard(
      window as unknown as ChunkGuardWindow
    );
    return () => {
      offChunkGuard();
      window.removeEventListener(NEW_VERSION_EVENT, prompt);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
