"use client";

import { useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

import { fetchJson } from "./core";

export type ConnectionState = "connected" | "disconnected" | "error";

export interface V3Connection {
  /** Provider id: "google", "outlook", "caldav", "gmail", or a catalog toolkit. */
  provider: string;
  kind: "calendar" | "mail" | "integration";
  state: ConnectionState;
  label: string;
  /** "Token expired · last sync 06:12" style detail, when there is one. */
  detail: string | null;
  accountId: string | null;
}

interface ApiCalendarAccount {
  id: string;
  provider: string;
  email: string;
  calendars: { id: string; name: string }[];
}
interface ApiMailAccount {
  id: string;
  provider: string;
  email?: string | null;
  address?: string | null;
  status?: string | null;
  lastSyncAt?: string | null;
}
interface ApiIntegration {
  id: string;
  provider: string;
  toolkit: string;
  status: string;
}

function list<T>(v: unknown, key: string): T[] {
  if (Array.isArray(v)) return v as T[];
  if (
    v &&
    typeof v === "object" &&
    Array.isArray((v as Record<string, unknown>)[key])
  )
    return (v as Record<string, T[]>)[key];
  return [];
}

/**
 * Every connected account in one list: calendars (`/api/accounts`), mail
 * (`/api/mail/accounts`) and catalog integrations (`/api/integrations/catalog`).
 * A source that fails to load is left out rather than failing the screen.
 */
export function useConnections() {
  return useQuery({
    queryKey: qk.connections(),
    queryFn: async () => {
      const [cal, mail, integ] = await Promise.allSettled([
        fetchJson<unknown>("/api/accounts"),
        fetchJson<unknown>("/api/mail/accounts"),
        fetchJson<{ connections: ApiIntegration[] }>(
          "/api/integrations/catalog"
        ),
      ]);
      const out: V3Connection[] = [];
      if (cal.status === "fulfilled") {
        for (const a of list<ApiCalendarAccount>(cal.value, "accounts")) {
          out.push({
            provider: a.provider.toLowerCase(),
            kind: "calendar",
            state: "connected",
            label: a.email,
            detail: null,
            accountId: a.id,
          });
        }
      }
      if (mail.status === "fulfilled") {
        for (const a of list<ApiMailAccount>(mail.value, "accounts")) {
          const failed = a.status === "ERROR";
          out.push({
            provider: a.provider.toLowerCase(),
            kind: "mail",
            state: failed
              ? "error"
              : a.status === "DISCONNECTED"
                ? "disconnected"
                : "connected",
            label: a.email ?? a.address ?? a.provider,
            detail: failed ? "Needs reconnecting" : null,
            accountId: a.id,
          });
        }
      }
      if (integ.status === "fulfilled") {
        for (const c of integ.value.connections ?? []) {
          out.push({
            provider: c.toolkit || c.provider,
            kind: "integration",
            state:
              c.status === "CONNECTED"
                ? "connected"
                : c.status === "ERROR"
                  ? "error"
                  : "disconnected",
            label: c.toolkit || c.provider,
            detail: null,
            accountId: c.id,
          });
        }
      }
      return out;
    },
    staleTime: 60_000,
  });
}
