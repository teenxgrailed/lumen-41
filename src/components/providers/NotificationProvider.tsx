"use client";

import React, { createContext, useContext, useEffect } from "react";

import { usePathname } from "next/navigation";

import { isAuthPath } from "@/lib/auth/auth-path";
import { notify } from "@/lib/notifications";

type NotificationType = "success" | "error" | "info" | "warning";

interface Notification {
  title: string;
  message: string;
  type: NotificationType;
}

interface NotificationContextType {
  showNotification: (notification: Notification) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotification must be used within a NotificationProvider"
    );
  }
  return context;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const showNotification = (notification: Notification) => {
    notify[notification.type](notification.title, {
      description: notification.message,
    });
  };

  const onAuth = isAuthPath(usePathname());

  useEffect(() => {
    /* No polling on the sign-in pages: nudges belong to a signed-in person's
       frame, and a poll started before a sign-in keeps running after it. */
    if (onAuth) return undefined;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch("/api/notifications", {
          cache: "no-store",
        });
        if (!response.ok || !active) return;
        const data = (await response.json()) as {
          notifications: Array<{
            id: string;
            title: string;
            body: string;
            deepLink: string;
          }>;
        };
        /* One at a time: the poll marks them all delivered, so the rest are
           already in the bell, and a stack of four cards covers the work. */
        const [first, ...rest] = data.notifications;
        if (first) {
          notify.info(first.title, {
            // Server nudges are the product speaking up on its own: the
            // island, not the action toast.
            surface: "island",
            description: rest.length
              ? `${first.body} ${rest.length} more in your inbox.`
              : first.body,
            action: {
              label: "Open",
              onClick: () => {
                window.location.assign(first.deepLink);
              },
            },
          });
        }
      } catch {
        // Background nudges are additive; normal app flows remain available.
      }
    };
    void poll();
    const interval = window.setInterval(poll, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [onAuth]);

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
    </NotificationContext.Provider>
  );
};
