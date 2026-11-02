"use client";

import { useCallback, useEffect, useRef } from "react";

import { emitDesktopEvent } from "@/lib/desktop";
import { logger } from "@/lib/logger";
import { setNativeAppIcon } from "@/lib/native";
import {
  APP_ICONS,
  APP_ICON_CHANGED_TOAST,
  APP_ICON_PREF,
  SEEN_ICON_PICKER_PREF,
  accountPredatesIcons,
  appIconFromPrefs,
  applyDocumentIcons,
  iconIntroSeenLocally,
  markIconIntroSeenLocally,
  nativeIconName,
  seenIconPickerFromPrefs,
  shouldShowIconPicker,
} from "@/lib/needt3/app-icon";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { useSetPrefs, useSettings } from "@/lib/needt3/hooks/settings";
import { notify } from "@/lib/notifications";
import { trackEvent } from "@/lib/umami";

import { useAppIcon } from "@/store/app-icon";
import { useNeedt3Ui } from "@/store/needt3-ui";

import { openPaywall, usePaywallStore } from "../paywall";
import { usePhoneUi } from "../root/phone-ui-context";
import { AiIconPicker } from "./AiIconPicker";

/** Any modal surface open: the popup never stacks on one of them. */
function useOverlayOpen(phone: boolean): boolean {
  const ui = useNeedt3Ui(
    (s) =>
      s.settingsOpen ||
      s.paletteOpen ||
      s.composerOpen ||
      s.focusOpen ||
      // docked beside the page on the desktop, a sheet on the phone
      (phone && s.askOpen)
  );
  const paywall = usePaywallStore((s) => s.open);
  return ui || paywall;
}

/**
 * Carries the saved icon into the store (and the favicon) once settings load.
 * `UserSettings.prefs.appIcon` is the source of truth, so a choice made on
 * another device arrives with the next settings fetch.
 */
export function useHydrateAppIcon() {
  const settings = useSettings();
  const setId = useAppIcon((s) => s.setId);
  const id = useAppIcon((s) => s.id);
  const data = settings.data;
  useEffect(() => {
    if (!data) return;
    setId(appIconFromPrefs(data.prefs));
  }, [data, setId]);
  useEffect(() => {
    applyDocumentIcons(id);
  }, [id]);
}

const LOG_SOURCE = "AppIconHost";

/**
 * Mounted once in the permanent hosts, for the phone and the desktop alike:
 * the one-time "New icons for Needt" popup, and the picker Settings ->
 * Appearance -> App icon opens. The popup announces the icons to people whose
 * account is older than the release; newer accounts never see it and get the
 * flag set quietly. It waits while Settings, the paywall, Focus, the palette
 * or the composer is open. A choice or a dismissal sets `prefs.seenIconPicker`
 * (retried once if the write fails) and a per-browser flag, so it never comes
 * back while the write is still pending.
 */
export function AppIconHost() {
  const ui = usePhoneUi();
  const picker = useAppIcon((s) => s.picker);
  const open = useAppIcon((s) => s.openPicker);
  const close = useAppIcon((s) => s.closePicker);
  const id = useAppIcon((s) => s.id);
  const setId = useAppIcon((s) => s.setId);
  const settings = useSettings();
  const plan = usePlan();
  const setPrefs = useSetPrefs();
  const offered = useRef(false);
  const kind = plan.data?.kind ?? "free";
  const seen = seenIconPickerFromPrefs(settings.data?.prefs);
  const userId = settings.data?.userId;
  const predates = accountPredatesIcons(settings.data?.createdAt);
  const loaded = settings.isSuccess && plan.isSuccess;
  const automated = typeof navigator !== "undefined" && navigator.webdriver;
  const overlayOpen = useOverlayOpen(ui === "phone") || picker !== null;

  useHydrateAppIcon();

  /** Saves the flag; a failed or refused write is tried once more. */
  const saveSeen = useCallback(
    (retry: boolean) => {
      setPrefs({ [SEEN_ICON_PICKER_PREF]: true })
        .then((saved) => {
          if (!saved) throw new Error("settings not loaded");
        })
        .catch((error: unknown) => {
          logger.warn(
            "Icon popup flag not saved",
            { error: error instanceof Error ? error.message : String(error) },
            LOG_SOURCE
          );
          if (retry) window.setTimeout(() => saveSeen(false), 5000);
        });
    },
    [setPrefs]
  );

  // Someone who dismissed it here but whose flag never landed (the write
  // failed, or settings were not loaded yet), and every account newer than
  // the icons: the flag is set quietly and the popup stays shut.
  const synced = useRef(false);
  useEffect(() => {
    if (synced.current || !loaded || seen || automated) return;
    const local = iconIntroSeenLocally(userId);
    if (!local && predates) return;
    synced.current = true;
    markIconIntroSeenLocally(userId);
    saveSeen(true);
  }, [loaded, seen, automated, userId, predates, saveSeen]);

  useEffect(() => {
    if (offered.current) return;
    const show = shouldShowIconPicker({
      loaded,
      seen,
      automated,
      predatesIcons: predates,
      seenLocally: iconIntroSeenLocally(userId),
      overlayOpen,
    });
    if (!show) return;
    // a beat after the screen settles, never on top of the first paint; an
    // overlay opening meanwhile clears the timer and the popup waits for it
    const t = window.setTimeout(() => {
      offered.current = true;
      open("intro");
    }, 1500);
    return () => window.clearTimeout(t);
  }, [loaded, seen, automated, predates, userId, overlayOpen, open]);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (picker && !wasOpen.current) trackEvent("icon_picker_open");
    wasOpen.current = !!picker;
  }, [picker]);

  const dismiss = useCallback(() => {
    close();
    markIconIntroSeenLocally(userId);
    if (!seen) saveSeen(true);
  }, [close, seen, userId, saveSeen]);

  const onPick = useCallback(
    (next: string) => {
      const before = id;
      close();
      markIconIntroSeenLocally(userId);
      setId(next);
      trackEvent("icon_selected", { id: next });
      void setNativeAppIcon(nativeIconName(next));
      emitDesktopEvent("app-icon", { id: next });
      void setPrefs({ [APP_ICON_PREF]: next, [SEEN_ICON_PICKER_PREF]: true })
        .then((saved) => {
          if (!saved) throw new Error("settings not loaded");
          notify.success(APP_ICON_CHANGED_TOAST);
        })
        .catch(() => {
          setId(before);
          notify.error("Couldn't change the icon. Try again.");
        });
    },
    [close, id, setId, setPrefs, userId]
  );

  const onUpgrade = useCallback(() => {
    dismiss();
    openPaywall("App icons");
  }, [dismiss]);

  if (!picker) return null;
  const phone = ui === "phone";
  return (
    <div className={"ai-host " + (phone ? "ai-phone" : "ai-desk")}>
      <div
        className="ai-scrim"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) dismiss();
        }}
      >
        <AiIconPicker
          icons={APP_ICONS}
          current={id}
          plan={kind}
          intro={picker === "intro"}
          onPick={onPick}
          onUpgrade={onUpgrade}
          onClose={dismiss}
        />
      </div>
    </div>
  );
}
