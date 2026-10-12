"use client";

/**
 * The integration catalog (`GET /api/integrations/catalog`): the four native
 * entries plus the Composio toolkits, and the person's connection to each.
 * Connect and disconnect are the existing routes; native calendars and mail
 * have their own OAuth starts.
 *
 * //todo: qk has no key for the catalog; it sits under `qk.connections()` so a
 * connections invalidation refreshes it.
 */
import { useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

import { fetchJson, sendJson } from "./core";

export type CatalogCategory =
  | "calendar"
  | "tasks"
  | "notes"
  | "communication"
  | "files"
  | "developer"
  | "ai";

export interface CatalogEntry {
  slug: string;
  name: string;
  description: string;
  category: CatalogCategory;
  native: boolean;
  /** The server has the credentials to start a connection. */
  configured: boolean;
}

export interface IntegrationRow {
  id: string;
  toolkit: string;
  status: string;
}

export interface V3Catalog {
  catalog: CatalogEntry[];
  integrations: IntegrationRow[];
}

const CATALOG = [...qk.connections(), "catalog"] as const;

export function useCatalog() {
  return useQuery({
    queryKey: CATALOG,
    queryFn: async (): Promise<V3Catalog> => {
      const data = await fetchJson<{
        catalog: (Omit<CatalogEntry, "native"> & { native?: boolean })[];
        connections: IntegrationRow[];
      }>("/api/integrations/catalog");
      return {
        catalog: data.catalog.map((c) => ({ ...c, native: !!c.native })),
        integrations: data.connections ?? [],
      };
    },
    staleTime: 60_000,
  });
}

type Outcome = { ok: true } | { ok: false; error: string };

const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

/** Composio toolkit: start the connection and go to the provider's consent page. */
export async function connectToolkit(toolkit: string): Promise<Outcome> {
  try {
    const { redirectUrl } = await sendJson<{ redirectUrl?: string }>(
      "/api/integrations/connect",
      "POST",
      { toolkit }
    );
    if (!redirectUrl) return { ok: false, error: "Connection failed" };
    window.location.assign(redirectUrl);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, "Could not connect") };
  }
}

export async function disconnectToolkit(id: string): Promise<Outcome> {
  try {
    await sendJson("/api/integrations/disconnect", "POST", { id });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, "Could not disconnect") };
  }
}

/** A calendar account (`DELETE /api/accounts`). */
export async function disconnectCalendar(accountId: string): Promise<Outcome> {
  try {
    await sendJson("/api/accounts", "DELETE", { accountId });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, "Could not disconnect") };
  }
}

/** A mailbox (`DELETE /api/mail/accounts/:id`). */
export async function disconnectMailbox(id: string): Promise<Outcome> {
  try {
    await sendJson(`/api/mail/accounts/${id}`, "DELETE");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, "Could not disconnect") };
  }
}
