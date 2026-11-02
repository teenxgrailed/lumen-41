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

/** One live personal access token, as `/api/personal-tokens` lists it. */
export interface PersonalToken {
  id: string;
  name: string;
  tokenPreview: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  /** Null: made before expiry existed; works until it is revoked. */
  expiresAt: string | null;
  expired: boolean;
  /** The one token everybody had before tokens were named ("Default"). */
  legacy: boolean;
}

/**
 * Needt MCP for the AI tools tab: the named personal tokens (one per tool,
 * `/api/personal-tokens`) and the OAuth apps (`/api/oauth/connected-apps`).
 * Called inside the connections controller so both faces share it.
 */
export function useMcpConnect(enabled: boolean) {
  const [origin, setOrigin] = useState("https://use.needt.app");
  const [apps, setApps] = useState<ConnectedApp[] | null>(null);
  const [tokens, setTokens] = useState<PersonalToken[] | null>(null);
  /** The token just made, kept for this view only (shown once). */
  const [token, setToken] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([
        fetch("/api/oauth/connected-apps"),
        fetch("/api/personal-tokens"),
      ]);
      if (!a.ok) throw new Error("apps");
      const body = (await a.json()) as { apps?: ConnectedApp[] };
      setApps(Array.isArray(body.apps) ? body.apps : []);
      if (s.ok) {
        const list = (await s.json()) as { tokens?: PersonalToken[] };
        setTokens(Array.isArray(list.tokens) ? list.tokens : []);
      }
      setFailed(false);
    } catch {
      setFailed(true);
      setApps((cur) => cur ?? []);
    }
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  /** Makes a named token; the plaintext is kept for this view only. */
  const makeToken = async (name: string): Promise<boolean> => {
    setMaking(true);
    try {
      const r = await fetch("/api/personal-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await r.json().catch(() => ({}))) as Partial<
        PersonalToken & { token: string; error: string }
      >;
      if (!r.ok || !data.token || !data.id) {
        notify.error(data.error ?? "Could not create the access token");
        setMaking(false);
        return false;
      }
      const entry: PersonalToken = {
        id: data.id,
        name: data.name ?? name,
        tokenPreview: data.tokenPreview ?? "",
        createdAt: data.createdAt ?? null,
        lastUsedAt: data.lastUsedAt ?? null,
        expiresAt: data.expiresAt ?? null,
        expired: false,
        legacy: false,
      };
      setToken(data.token);
      setTokenName(entry.name);
      // The Default token leads the list, then the newest.
      setTokens((cur) => [
        ...(cur ?? []).filter((t) => t.legacy),
        entry,
        ...(cur ?? []).filter((t) => !t.legacy),
      ]);
      notify.success("Access token created");
      setMaking(false);
      return true;
    } catch {
      notify.error("Could not create the access token");
      setMaking(false);
      return false;
    }
  };

  /** Revokes one token; the others keep working. */
  const revokeToken = async (entry: PersonalToken) => {
    try {
      const r = await fetch(
        `/api/personal-tokens/${encodeURIComponent(entry.id)}`,
        { method: "DELETE" }
      );
      if (!r.ok) throw new Error("revoke");
      notify.success(`${entry.name} token revoked`);
      setTokens((cur) => cur?.filter((t) => t.id !== entry.id) ?? null);
    } catch {
      notify.error(`Could not revoke ${entry.name}`);
    }
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
    tokens,
    hasToken: (tokens?.length ?? 0) > 0,
    token,
    tokenName,
    making,
    makeToken,
    revokeToken,
    disconnectApp,
    url: tokenUrl(origin),
    oauthUrl: oauthUrl(),
  };
}

export type McpConnect = ReturnType<typeof useMcpConnect>;
