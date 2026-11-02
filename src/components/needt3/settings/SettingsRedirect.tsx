"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { takePostAuthPath } from "@/lib/auth/post-auth-path";
import { notify } from "@/lib/notifications";
import {
  rememberStudentOffer,
  studentOfferFromSearch,
} from "@/lib/students/offer";

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
 * `?checkout=pro-year|pro-month|lifetime` (the landing's buy links) opens the
 * Plan section. It does not start checkout itself: a purchase first needs the
 * withdrawal-right box (Terms 5.5) ticked, and that box is in the Plan
 * section. The param is removed from the address either way.
 */
export function SettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
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

    // needt.app/students: Plan opens with the student price in view.
    if (studentOfferFromSearch(search)) rememberStudentOffer();

    if (checkoutFromSearch(search)) {
      window.history.replaceState(
        window.history.state,
        "",
        withoutCheckoutParam(`${pathname}${search}${hash}`)
      );
      useNeedt3Ui.getState().openSettings("plan");
      router.replace("/today");
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
