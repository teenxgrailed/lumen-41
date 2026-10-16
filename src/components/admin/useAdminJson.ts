"use client";

import { useCallback, useEffect, useState } from "react";

export interface AdminJson<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * GETs an admin API and keeps the answer. A non-2xx answer becomes `error`
 * (the API's own message when it sent one), never a thrown render. `url` of
 * null waits: nothing is fetched until it is set.
 */
export function useAdminJson<T>(url: string | null): AdminJson<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(url !== null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (url === null) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    fetch(url, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | (T & { error?: string })
          | null;
        if (!live) return;
        if (!response.ok) {
          setError(
            response.status === 403
              ? "Admin access required."
              : (body?.error ?? `Could not load (${response.status}).`)
          );
          return;
        }
        setData(body as T);
        setError(null);
      })
      .catch(() => {
        if (live) setError("Could not reach the server.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [url, tick]);

  return { data, error, loading, reload };
}

/** Sends one admin write and reports the API's own message on failure. */
export async function sendAdminJson<T = unknown>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, {
      method,
      headers:
        body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const parsed = (await response.json().catch(() => null)) as
      | (T & { error?: string })
      | null;
    if (!response.ok) {
      return {
        ok: false,
        error: parsed?.error ?? `The request failed (${response.status}).`,
      };
    }
    return { ok: true, data: parsed as T };
  } catch {
    return { ok: false, error: "Could not reach the server." };
  }
}
