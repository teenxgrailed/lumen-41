"use client";

import { ActionToasts } from "@/components/needt/corner/ActionToasts";

import { AppIconHost } from "../app-icon/AppIconHost";
import { ComposerHost } from "../composer/Composer";
import { CornerLayer } from "../corner/CornerLayer";
import { FeedbackPromptHost } from "../feedback/FeedbackPromptHost";
import { FocusHost } from "../focus/FocusHost";
import { HabitPresenceHost } from "../habits/quit/HabitPresenceHost";
import { NativePushHost } from "../push/NativePushHost";
import { PopupHost } from "../popups/PopupHost";
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
      {/* The app icon picker and its one-time popup, on both UIs. */}
      <AppIconHost />
      {/* The occasional "how is Needt?" question; the server picks who and when. */}
      <FeedbackPromptHost />
      {/* On the phone too: its snacks are the same notices, and nothing else
          on the phone draws them. */}
      <ActionToasts />
      {/* One instance for both UIs; the controller inside survives the swap. */}
      <FocusHost />
      {/* Announcements and plan moments: one shell, one set of rules. */}
      <PopupHost />
      {/* The iOS app: notification taps and the APNs token. */}
      <NativePushHost />
      {ui === "phone" ? null : (
        <>
          <ComposerHost />
          <CornerLayer />
          {/* Habits speaking up in the corner (behind habits_quit). Where
              the island lives: the phone has none, its channel is the push. */}
          <HabitPresenceHost />
        </>
      )}
    </>
  );
}
