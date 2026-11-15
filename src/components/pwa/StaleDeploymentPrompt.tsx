"use client";

import { useEffect, useRef, useState } from "react";

import { usePathname } from "next/navigation";

import { createPortal } from "react-dom";

import { NeedtLoading } from "@/components/needt3/states/NeedtLoading";

import { NEW_VERSION_EVENT } from "@/lib/pwa/build-version";
import {
  type ChunkGuardWindow,
  installChunkReloadGuard,
} from "@/lib/pwa/chunk-reload";
import {
  type SafeReload,
  createSafeReload,
  reloadPage,
} from "@/lib/pwa/safe-reload";
import { staleDeploymentReason } from "@/lib/stale-deployment";

/**
 * Reloads the page, by itself, when it is from an older deploy: a server
 * action failed, the server reports a newer build, or a new worker took over.
 * No toast and no button. The loading word goes up and the page reloads at the
 * first moment that cannot lose typing (see `lib/pwa/safe-reload.ts`).
 */
export function StaleDeploymentPrompt() {
  const [reloading, setReloading] = useState(false);
  const gate = useRef<SafeReload | null>(null);
  const pathname = usePathname();
  const lastPath = useRef(pathname);

  useEffect(() => {
    const safe = createSafeReload({
      doc: document,
      onCommit: () => setReloading(true),
      onCancel: () => setReloading(false),
      reload: reloadPage,
      storage: (() => {
        try {
          return window.sessionStorage;
        } catch {
          return null;
        }
      })(),
    });
    gate.current = safe;
    const prompt = () => safe.request();

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
      gate.current = null;
      safe.dispose();
      offChunkGuard();
      window.removeEventListener(NEW_VERSION_EVENT, prompt);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  // The next route change is a safe moment even with a field half-written.
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    gate.current?.routeChanged();
  }, [pathname]);

  if (!reloading) return null;
  // Inside the v3 scope when there is one, so it wears the person's theme.
  const scope = document.querySelector(".needt-v3");
  if (scope) return createPortal(<NeedtLoading fixed />, scope);
  // No v3 scope (no tokens): the host class carries the literal colours.
  return createPortal(
    <div className="nl-host">
      <NeedtLoading fixed />
    </div>,
    document.body
  );
}
