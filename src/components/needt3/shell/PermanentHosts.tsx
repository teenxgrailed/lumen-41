"use client";

import { ComposerHost } from "../composer/Composer";
import { CornerLayer } from "../corner/CornerLayer";
import { FocusHost } from "../focus/FocusHost";
import { usePhoneUi } from "../root/phone-ui-context";
import { SettingsSheet } from "../settings/SettingsSheet";

/**
 * The hosts the UI opens through the store: the Settings sheet, the composer
 * and Ask (the corner layer), and the Focus window (one controller, two faces). They are one fixed sibling in the frame, beside
 * the UI-dependent `overlays` slot, so the Settings sheet is the same instance
 * on the phone and on the desktop and is never remounted when the UI changes.
 * The Paywall host is the same kind of thing; it sits in `V3Root`, a sibling of
 * the shell.
 *
 * The composer and Ask are the desktop's only. The phone draws its own (the
 * bottom sheet that grows out of menu A's pill, and the phone Ask sheet) in
 * `PhoneOverlays`, against the same `composerOpen` / `askOpen` flags, so on the
 * phone these two must not mount: that would be two composers and two Ask
 * panels answering one flag. A composer that is open when the window crosses
 * 700 px stays open: the flag lives in the store and the other UI's composer
 * takes it up.
 */
export function PermanentHosts() {
  const ui = usePhoneUi();
  return (
    <>
      <SettingsSheet />
      {/* One instance for both UIs; the controller inside survives the swap. */}
      <FocusHost />
      {ui === "phone" ? null : (
        <>
          <ComposerHost />
          <CornerLayer />
        </>
      )}
    </>
  );
}
