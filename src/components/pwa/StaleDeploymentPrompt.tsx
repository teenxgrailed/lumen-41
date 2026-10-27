"use client";

import { useEffect } from "react";

import { notify } from "@/lib/notifications";
import { staleDeploymentReason } from "@/lib/stale-deployment";

/** Offers a reload when a server action fails because the page is from an older deploy. */
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
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
