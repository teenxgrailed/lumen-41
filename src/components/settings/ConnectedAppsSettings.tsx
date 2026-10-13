"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { notify } from "@/lib/notifications";

import { SettingRow } from "./SettingsSection";

interface ConnectedApp {
  id: string;
  clientName: string;
  scopes: string[];
  connectedAt: string;
  lastUsedAt: string | null;
}

const SCOPE_NAMES: Record<string, string> = {
  "needt.read": "read",
  "needt.write": "write",
  "mail.read": "mail",
};

function day(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "never";
}

/**
 * Settings › Connected apps: OAuth clients (claude.ai, ChatGPT, Claude Code)
 * the person allowed, with a Disconnect that ends the grant at once.
 */
export function ConnectedAppsSettings() {
  const [apps, setApps] = useState<ConnectedApp[] | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/oauth/connected-apps");
    if (!response.ok) {
      notify.error("Could not load connected apps");
      setApps([]);
      return;
    }
    const body = (await response.json().catch(() => null)) as {
      apps?: ConnectedApp[];
    } | null;
    setApps(Array.isArray(body?.apps) ? body.apps : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const disconnect = async (app: ConnectedApp) => {
    const response = await fetch(`/api/oauth/connected-apps/${app.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      notify.error(`Could not disconnect ${app.clientName}`);
      return;
    }
    notify.success(`${app.clientName} disconnected`);
    setApps((current) => current?.filter((a) => a.id !== app.id) ?? null);
  };

  return (
    <SettingRow
      label="Connected apps"
      description="Apps you allowed through Needt's sign-in, such as claude.ai or ChatGPT. Disconnecting stops them at once."
    >
      {apps === null ? (
        <Skeleton className="h-8 w-full" />
      ) : apps.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          No apps are connected.
        </p>
      ) : (
        <ul className="space-y-2">
          {apps.map((app) => (
            <li
              key={app.id}
              className="flex items-center justify-between gap-3"
              data-connected-app={app.id}
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">
                  {app.clientName}
                </span>
                <span className="block text-[12px] text-muted-foreground">
                  {app.scopes.map((s) => SCOPE_NAMES[s] ?? s).join(", ")} ·
                  connected {day(app.connectedAt)} · last used{" "}
                  {day(app.lastUsedAt)}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void disconnect(app)}
              >
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SettingRow>
  );
}
