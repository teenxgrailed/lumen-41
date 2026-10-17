"use client";

import React, { createContext, useContext, useEffect } from "react";

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

  useEffect(() => {
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
        for (const notification of data.notifications) {
          notify.info(notification.title, {
            // Server nudges are the product speaking up on its own: the
            // island, not the action toast.
            surface: "island",
            description: notification.body,
            action: {
              label: "Open",
              onClick: () => {
                window.location.assign(notification.deepLink);
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
  }, []);

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
    </NotificationContext.Provider>
  );
};
