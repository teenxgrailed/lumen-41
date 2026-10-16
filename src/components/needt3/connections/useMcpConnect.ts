"use client";

import { useCallback, useEffect, useState } from "react";

import { notify } from "@/lib/notifications";

import { oauthUrl, tokenUrl } from "./mcp";

export interface ConnectedApp {
  id: string;
  clientName: string;
  scopes: string[];
  connectedAt: string;
  lastUsedAt: string | null;
}

/**
 * Needt MCP for the AI tools tab: the personal token (Settings › Personal API,
 * `/api/connector-settings`) and the OAuth apps (`/api/oauth/connected-apps`).
 * Called inside the connections controller so both faces share it.
 */
export function useMcpConnect(enabled: boolean) {
  const [origin, setOrigin] = useState("https://use.needt.app");
  const [apps, setApps] = useState<ConnectedApp[] | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([
        fetch("/api/oauth/connected-apps"),
        fetch("/api/connector-settings"),
      ]);
      if (!a.ok) throw new Error("apps");
      const body = (await a.json()) as { apps?: ConnectedApp[] };
      setApps(Array.isArray(body.apps) ? body.apps : []);
      if (s.ok)
        setHasToken(!!((await s.json()) as { hasToken?: boolean }).hasToken);
      setFailed(false);
    } catch {
      setFailed(true);
      setApps((cur) => cur ?? []);
    }
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  /** Makes (or rotates) the token; the new one is kept for this view only. */
  const makeToken = async () => {
    setMaking(true);
    try {
      const r = await fetch("/api/connector-settings", { method: "POST" });
      if (!r.ok) throw new Error("token");
      const data = (await r.json()) as { token?: string };
      setToken(data.token ?? null);
      setHasToken(true);
      notify.success("Access token created");
    } catch {
      notify.error("Could not create the access token");
    }
    setMaking(false);
  };

  const disconnectApp = async (app: ConnectedApp) => {
    const r = await fetch(`/api/oauth/connected-apps/${app.id}`, {
      method: "DELETE",
    });
    if (!r.ok)
      return void notify.error(`Could not disconnect ${app.clientName}`);
    notify.success(`${app.clientName} disconnected`);
    setApps((cur) => cur?.filter((x) => x.id !== app.id) ?? null);
  };

  return {
    apps,
    failed,
    reload: load,
    hasToken,
    token,
    making,
    makeToken,
    disconnectApp,
    url: tokenUrl(origin),
    oauthUrl: oauthUrl(),
  };
}

export type McpConnect = ReturnType<typeof useMcpConnect>;
