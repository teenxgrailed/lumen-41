"use client";

import { useCallback, useEffect, useRef } from "react";

import { emitDesktopEvent } from "@/lib/desktop";
import { setNativeAppIcon } from "@/lib/native";
import {
  APP_ICONS,
  APP_ICON_CHANGED_TOAST,
  APP_ICON_PREF,
  SEEN_ICON_PICKER_PREF,
  appIconFromPrefs,
  applyDocumentIcons,
  nativeIconName,
  seenIconPickerFromPrefs,
  shouldShowIconPicker,
} from "@/lib/needt3/app-icon";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { useSetPrefs, useSettings } from "@/lib/needt3/hooks/settings";
import { notify } from "@/lib/notifications";
import { trackEvent } from "@/lib/umami";

import { useAppIcon } from "@/store/app-icon";

import { openPaywall } from "../paywall";
import { usePhoneUi } from "../root/phone-ui-context";
import { AiIconPicker } from "./AiIconPicker";

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

/**
 * Mounted once in the permanent hosts, for the phone and the desktop alike:
 * the one-time "New icons for Needt" popup for people who have not seen it,
 * and the picker Settings -> Appearance -> App icon opens. A choice or a
 * dismissal sets `prefs.seenIconPicker`, so the popup never comes back.
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

  useHydrateAppIcon();

  useEffect(() => {
    if (offered.current) return;
    const show = shouldShowIconPicker({
      loaded: settings.isSuccess && plan.isSuccess,
      seen,
      automated: typeof navigator !== "undefined" && navigator.webdriver,
    });
    if (!show) return;
    offered.current = true;
    // a beat after the screen settles, never on top of the first paint
    const t = window.setTimeout(() => open("intro"), 1500);
    return () => window.clearTimeout(t);
  }, [settings.isSuccess, plan.isSuccess, seen, open]);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (picker && !wasOpen.current) trackEvent("icon_picker_open");
    wasOpen.current = !!picker;
  }, [picker]);

  const dismiss = useCallback(() => {
    close();
    if (!seen)
      void setPrefs({ [SEEN_ICON_PICKER_PREF]: true }).catch(() => null);
  }, [close, seen, setPrefs]);

  const onPick = useCallback(
    (next: string) => {
      const before = id;
      close();
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
    [close, id, setId, setPrefs]
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
