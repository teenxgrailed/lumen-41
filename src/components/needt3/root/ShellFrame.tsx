"use client";

import type { ReactNode } from "react";

import type { PhoneUi } from "@/lib/needt3/phone-ui";

import { V3PortalScope } from "../ctx/PortalScope";
import { PkThemeRoot } from "../phone/kit/theme";

export interface ShellFrameProps {
  /** Which chrome is drawn around the page. */
  ui: PhoneUi;
  /** Desktop: the top bar. Phone: null. */
  top: ReactNode;
  /** Desktop: the floating-rail scrim, the rail and the Focus Mode exit. Phone: null. */
  rail: ReactNode;
  /** After the row: the desktop's layers (menus, sheets, palette), or the phone's chrome. */
  overlays: ReactNode;
  /**
   * Hosts both UIs need (Settings, composer, Ask). A fixed slot after
   * `overlays`: it never depends on `ui`, so its children are not remounted
   * when the UI changes.
   */
  hosts?: ReactNode;
  /** Moving between two places swaps the page; one place's pages keep it. */
  placeKey: string;
  /** The desktop page's padding (Focus Mode widens it). */
  mainPadding: string;
  children?: ReactNode;
}

/**
 * The one skeleton of the v3 frame, for both UIs.
 *
 * Crossing 700 px swaps the shell layer, never the route children. Choosing in
 * JavaScript after hydration used to remount the page (see the comment in
 * `components/layout/AppShell.tsx`), so the guarantee here is structural: the
 * route children sit under the same chain of elements at every width, from
 * this component's root down to the single `<main>` and its keyed wrapper.
 * Nothing above them changes type or position when `ui` changes. The
 * chrome slots (`top`, `rail`, `overlays`, `hosts`) are siblings of that chain at fixed
 * positions, so filling or emptying them never moves it; the elements on the
 * chain only change className, attributes and style. A Jest test mounts it,
 * flips `ui` both ways and asserts the children and the `<main>` node are the
 * same (`__tests__/ShellFrame.test.ts`).
 *
 * Phone: the frame carries `data-v2p-frame` and the `<main>` is the screen host
 * (`data-v2p-host`) the halftone sweep and the blur hand-off target. The route
 * stage has no entry animation on the phone, so no ancestor of a blur band
 * ever has opacity (PORT.md §3a).
 */
export function ShellFrame({
  ui,
  top,
  rail,
  overlays,
  hosts,
  placeKey,
  mainPadding,
  children,
}: ShellFrameProps) {
  const phone = ui === "phone";
  return (
    <PkThemeRoot>
      <div
        className={
          "app theme-surface theme-drifts" +
          (phone ? " mn-screen v2p-frame" : "")
        }
        data-v2p-frame={phone ? "" : undefined}
        data-ui={ui}
        style={{ display: "flex", flexDirection: "column", height: "100%" }}
      >
        <V3PortalScope>
          {top}
          <div className="shell-app-row">
            {rail}
            <main
              className={phone ? "v3-phone-host" : "shell-app-stack"}
              data-v2p-host={phone ? "" : undefined}
              style={phone ? undefined : { padding: mainPadding }}
            >
              <div
                key={placeKey}
                className={
                  phone ? "v2p-stage" : "screen-enter shell-app-screen-enter"
                }
              >
                {children}
              </div>
            </main>
          </div>
          {overlays}
          {hosts}
        </V3PortalScope>
      </div>
    </PkThemeRoot>
  );
}
