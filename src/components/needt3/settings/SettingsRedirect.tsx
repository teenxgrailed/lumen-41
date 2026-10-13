"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { notify } from "@/lib/notifications";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { settingsNotices, settingsRedirectTarget } from "./derive";

/**
 * `/settings#section` with design_v3 on: open the Settings sheet at that
 * section and leave the URL on Today, the page the sheet sits over. Anchors
 * that moved out of Settings (`#calendars`, `#integrations`, `#ai`) go to
 * Connections instead. The query a redirect brought back (calendar OAuth
 * result, `billing=success`, `emailVerification=verified`) is said as a
 * notice first, since replacing the URL drops it. The hash only exists in the
 * browser, so this is a client step after the server has decided the route
 * exists.
 */
export function SettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    for (const n of settingsNotices(window.location.search)) {
      // Keyed, so a double-run effect (dev Strict Mode) raises one card.
      const opts = {
        description: n.description,
        dedupeKey: `settings-redirect:${n.title}`,
      };
      if (n.tone === "error") notify.error(n.title, opts);
      else notify.success(n.title, opts);
    }
    const target = settingsRedirectTarget(window.location.hash);
    if (target.kind === "screen") {
      router.replace(target.href);
      return;
    }
    useNeedt3Ui.getState().openSettings(target.section);
    router.replace("/today");
  }, [router]);
  return null;
}
