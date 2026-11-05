"use client";

import { notify } from "@/lib/notifications";

import {
  APP_PUSH_COPY,
  NATIVE_PUSH_COPY,
  PUSH_COPY,
  usePushNotifications,
} from "./push";

export type PushAction = {
  key: "enable" | "test" | "disable";
  label: string;
  onClick: () => void;
  disabled: boolean;
};

/**
 * The row shown at the top of Settings → Notifications on desktop and phone:
 * what to say and which buttons to draw for this device's state.
 */
export function usePushRow() {
  const push = usePushNotifications();
  const { title, desc } =
    (push.native ? NATIVE_PUSH_COPY[push.state] : undefined) ??
    (push.app ? APP_PUSH_COPY[push.state] : undefined) ??
    PUSH_COPY[push.state];

  const enable = () =>
    void push.enable().then((result) => {
      if (result === "ok") notify.success("Notifications are on");
      else if (result === "failed")
        notify.error("Could not turn notifications on");
    });
  const test = () =>
    void push.sendTest().then((result) => {
      if (result === "ok") notify.success("Test notification sent");
      else if (result === "expired")
        notify.error(
          "This device was not subscribed. Turn notifications on again."
        );
      else notify.error("Could not send the test notification");
    });
  const disable = () =>
    void push.disable().then(
      () => notify.info("Notifications are off on this device"),
      () => notify.error("Could not turn notifications off")
    );

  const actions: PushAction[] =
    push.state === "off"
      ? [
          {
            key: "enable",
            label: push.app ? "Allow" : "Enable notifications",
            onClick: enable,
            disabled: push.busy,
          },
        ]
      : push.state === "on"
        ? [
            {
              key: "test",
              label: "Send test notification",
              onClick: test,
              disabled: push.busy,
            },
            // The app's permission is the system's to take back.
            ...(push.app
              ? []
              : [
                  {
                    key: "disable" as const,
                    label: "Turn off",
                    onClick: disable,
                    disabled: push.busy,
                  },
                ]),
          ]
        : [];

  return { state: push.state, title, desc, actions };
}
