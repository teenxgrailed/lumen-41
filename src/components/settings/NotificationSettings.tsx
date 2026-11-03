import { useState } from "react";

import { notify } from "@/lib/notifications";

import { useSettingsStore } from "@/store/settings";

import { MotionSwitchRow } from "./MotionSettingsControls";
import { SettingsSection } from "./SettingsSection";

export function NotificationSettings() {
  const { notifications, updateNotificationSettings } = useSettingsStore();
  const [pushNote, setPushNote] = useState<string | null>(null);

  const enablePush = async (enabled: boolean) => {
    if (enabled && !notifications.webPushConfigured) return;

    if (!enabled) {
      const registration = await navigator.serviceWorker?.ready;
      const subscription = await registration?.pushManager
        .getSubscription()
        .catch(() => null);
      if (subscription) {
        await fetch(
          `/api/push-subscriptions?endpoint=${encodeURIComponent(subscription.endpoint)}`,
          { method: "DELETE" }
        );
        await subscription.unsubscribe();
      }
      updateNotificationSettings({
        webPushEnabled: false,
        webPushSubscription: null,
      });
      setPushNote(null);
      return;
    }

    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !("Notification" in window) ||
      !navigator.serviceWorker
    ) {
      updateNotificationSettings({ webPushEnabled: false });
      return;
    }

    try {
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        ("standalone" in navigator &&
          Boolean(
            (navigator as Navigator & { standalone?: boolean }).standalone
          ));
      if (isIos && !isStandalone) {
        setPushNote(
          "On iPhone and iPad, install Needt to the Home Screen to receive Web Push. Email reminders remain active."
        );
        updateNotificationSettings({ webPushEnabled: false });
        notify.info("Install the PWA for iOS push notifications");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        updateNotificationSettings({ webPushEnabled: false });
        notify.info("Browser notifications remain off");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const configResponse = await fetch("/api/push-subscriptions");
      const config = (await configResponse.json()) as {
        publicKey?: string | null;
      };
      const vapidKey = config.publicKey;
      let subscription: PushSubscriptionJSON | null = null;

      if (vapidKey) {
        const pushSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
        subscription = pushSubscription.toJSON();
        const persisted = await fetch("/api/push-subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription),
        });
        if (!persisted.ok) throw new Error("Could not save subscription");
      } else {
        throw new Error("Web Push is not configured");
      }

      updateNotificationSettings({
        webPushEnabled: true,
        webPushSubscription: subscription,
      });
      setPushNote(
        "Web Push works while the browser is closed. Email remains the fallback when a subscription expires."
      );
      notify.success("Browser notifications enabled");
    } catch {
      updateNotificationSettings({ webPushEnabled: false });
      notify.error("Could not enable browser notifications");
    }
  };

  const notificationRows = [
    {
      key: "eventInvites" as const,
      label: "New invitations",
    },
    {
      key: "eventUpdates" as const,
      label: "Event changes",
    },
    {
      key: "eventCancellations" as const,
      label: "Cancellations",
    },
    {
      key: "eventReminders" as const,
      label: "Upcoming events",
    },
  ];

  return (
    <div className="max-w-[896px] space-y-9">
      <SettingsSection
        title="Delivery"
        description="Choose where Needt can reach you. Browser notifications always require your permission."
      >
        <div className="space-y-0.5">
          <MotionSwitchRow
            label="Daily plan email"
            checked={notifications.dailyEmailEnabled}
            onCheckedChange={(enabled) =>
              updateNotificationSettings({ dailyEmailEnabled: enabled })
            }
          />
          <MotionSwitchRow
            label="Browser notifications"
            checked={
              notifications.webPushConfigured && notifications.webPushEnabled
            }
            onCheckedChange={enablePush}
            disabled={!notifications.webPushConfigured}
          />
          {!notifications.webPushConfigured ? (
            <p className="px-3 pb-2 text-xs leading-5 text-[var(--text-muted)]">
              Push delivery setup is incomplete on this Needt server. Browser
              notifications are unavailable. Email reminders still work.
            </p>
          ) : (
            pushNote && (
              <p className="px-3 pb-2 text-xs leading-5 text-[var(--text-muted)]">
                {pushNote}
              </p>
            )
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Calendar alerts"
        description="Select which calendar changes should produce a notification."
      >
        <div className="space-y-0.5">
          {notificationRows.map((row) => (
            <MotionSwitchRow
              key={row.key}
              label={row.label}
              checked={notifications.notifyFor[row.key]}
              onCheckedChange={(checked) =>
                updateNotificationSettings({
                  notifyFor: {
                    ...notifications.notifyFor,
                    [row.key]: checked,
                  },
                })
              }
              indented
            />
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
