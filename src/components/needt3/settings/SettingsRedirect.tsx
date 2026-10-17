"use client";

import { useEffect, useRef } from "react";

import { useRouter } from "next/navigation";

import { takePostAuthPath } from "@/lib/auth/post-auth-path";
import { startCheckout } from "@/lib/needt3/hooks/account";
import { notify } from "@/lib/notifications";

import { useNeedt3Ui } from "@/store/needt3-ui";

import {
  checkoutFromSearch,
  settingsNotices,
  settingsRedirectTarget,
  withoutCheckoutParam,
} from "./derive";

/**
 * `/settings#section` or `/settings?section=billing` with design_v3 on: open
 * the Settings sheet at that section and leave the URL on Today, the page the
 * sheet sits over. Anchors that moved out of Settings (`#calendars`,
 * `#integrations`, `#ai`) go to Connections instead. The query a redirect
 * brought back (calendar OAuth result, `billing=success`,
 * `emailVerification=verified`) is said as a notice first, since replacing the
 * URL drops it. The hash only exists in the browser, so this is a client step
 * after the server has decided the route exists.
 *
 * `?checkout=pro-year|pro-month|lifetime` (the landing's buy links) starts
 * that plan's checkout at once, the way the Plan section's button does. The
 * param is removed from the address first, so a reload or Back cannot start a
 * second one. When checkout is closed ("Checkout opens soon.", "Billing is not
 * configured.") the server's sentence is said and the sheet opens on Plan.
 */
export function SettingsRedirect() {
  const router = useRouter();
  const checkoutStarted = useRef(false);
  useEffect(() => {
    // A checkout is on its way; do not navigate away from under it.
    if (checkoutStarted.current) return;
    const { pathname, search, hash } = window.location;
    // The sign-in detours are over once a Settings link has opened.
    takePostAuthPath();
    for (const n of settingsNotices(search)) {
      // Keyed, so a double-run effect (dev Strict Mode) raises one card.
      const opts = {
        description: n.description,
        dedupeKey: `settings-redirect:${n.title}`,
      };
      if (n.tone === "error") notify.error(n.title, opts);
      else notify.success(n.title, opts);
    }

    const choice = checkoutFromSearch(search);
    if (choice) {
      checkoutStarted.current = true;
      window.history.replaceState(
        window.history.state,
        "",
        withoutCheckoutParam(`${pathname}${search}${hash}`)
      );
      void startCheckout(choice).then((r) => {
        if (r.ok) return; // the browser is on its way to the payment page
        notify.error(r.error, { dedupeKey: "settings-redirect:checkout" });
        useNeedt3Ui.getState().openSettings("plan");
        router.replace("/today");
      });
      return;
    }

    const target = settingsRedirectTarget(hash, search);
    if (target.kind === "screen") {
      router.replace(target.href);
      return;
    }
    useNeedt3Ui.getState().openSettings(target.section);
    router.replace("/today");
  }, [router]);
  return null;
}
