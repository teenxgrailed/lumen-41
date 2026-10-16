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
  | "ai"
  | "creative";

export interface CatalogEntry {
  slug: string;
  name: string;
  description: string;
  category: CatalogCategory;
  native: boolean;
  /** The server has the credentials to start a connection. */
  configured: boolean;
  /** What the server lacks, in words for an admin. Sent to admins only. */
  requires?: string;
}

export interface IntegrationRow {
  id: string;
  toolkit: string;
  status: string;
}

export interface V3Catalog {
  catalog: CatalogEntry[];
  integrations: IntegrationRow[];
  /** The viewer administers this server (so can add what is missing). */
  isAdmin: boolean;
}

const CATALOG = [...qk.connections(), "catalog"] as const;

export function useCatalog() {
  return useQuery({
    queryKey: CATALOG,
    queryFn: async (): Promise<V3Catalog> => {
      const data = await fetchJson<{
        catalog: (Omit<CatalogEntry, "native"> & { native?: boolean })[];
        connections: IntegrationRow[];
        isAdmin?: boolean;
      }>("/api/integrations/catalog");
      return {
        catalog: data.catalog.map((c) => ({ ...c, native: !!c.native })),
        integrations: data.connections ?? [],
        isAdmin: !!data.isAdmin,
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

/**
 * Google / Outlook calendars and mailboxes start their own OAuth at a GET
 * route that answers with a redirect to the provider. When the start is
 * refused (calendar or mailbox limit, no credentials) it answers JSON, which a
 * plain navigation would paint as a raw page. So the start is tried first with
 * redirects held back: a redirect means go (the browser then follows it), any
 * other answer is shown as a notice instead.
 */
export async function startOAuth(href: string): Promise<Outcome> {
  try {
    const res = await fetch(href, {
      redirect: "manual",
      credentials: "same-origin",
    });
    if (
      res.type !== "opaqueredirect" &&
      !(res.status >= 300 && res.status < 400)
    ) {
      const body = (await res.json().catch(() => null)) as {
        error?: unknown;
      } | null;
      return {
        ok: false,
        error:
          typeof body?.error === "string" ? body.error : "Could not connect",
      };
    }
  } catch {
    /* offline or blocked: let the browser try the page itself */
  }
  window.location.assign(href);
  return { ok: true };
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

/** The Pinterest grant (`POST /api/pinterest/disconnect`); imported pictures stay. */
export async function disconnectPinterest(): Promise<Outcome> {
  try {
    await sendJson("/api/pinterest/disconnect", "POST", {});
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
