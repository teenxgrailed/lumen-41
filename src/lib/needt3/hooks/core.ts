"use client";

import { useCallback } from "react";

import {
  type QueryClient,
  type QueryKey,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/notifications";

const LOG_SOURCE = "Needt3Hooks";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** fetch → JSON, throwing `ApiError` with the server's message on non-2xx. */
export async function fetchJson<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let message = res.statusText || `Request failed (${res.status})`;
    try {
      const text = await res.text();
      if (text) {
        try {
          const body = JSON.parse(text) as { error?: unknown };
          message = typeof body.error === "string" ? body.error : text;
        } catch {
          message = text;
        }
      }
    } catch {
      /* keep the status text */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const sendJson = <T>(
  url: string,
  method: string,
  body?: unknown,
  headers?: Record<string, string>
) =>
  fetchJson<T>(url, {
    method,
    ...(headers ? { headers } : {}),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

/**
 * `If-Match` for a row we hold. Once the offline service worker is active it
 * stamps every write with its scope, and the API then rejects a write that
 * names no revision (409 OFFLINE_REVISION_CONFLICT) — the old screens send
 * this from src/lib/task-api.ts, v3 writes must too.
 */
export function revisionHeader(
  updatedAt: string | null | undefined
): Record<string, string> | undefined {
  return updatedAt
    ? { "If-Match": newDate(updatedAt).toISOString() }
    : undefined;
}

/** The browser's IANA zone; the settings hook overrides it with the saved one. */
export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** What every v3 mutation resolves to: the server's answer and a way back. */
export interface Undoable<R> {
  result: R;
  /** Reverts the change on the server (and optimistically in the cache). */
  undo: () => Promise<void>;
}

export interface UndoableMutationOptions<V, R> {
  /** Query-key prefix the change touches: snapshotted, then invalidated. */
  scope: QueryKey | readonly QueryKey[];
  /** What the change is called in an error message: "move the task". */
  label: string;
  /** Writes the expected result into the cache before the request. */
  optimistic?: (qc: QueryClient, vars: V) => void;
  request: (vars: V) => Promise<R>;
  /**
   * The variables that undo `vars`, read from the cache BEFORE the
   * optimistic write (or from the result, for creates). `null` = no undo.
   */
  inverse?: (qc: QueryClient, vars: V, result?: R) => V | null;
  /** Inverse computed only once the server has answered (e.g. a create). */
  inverseFromResult?: boolean;
  /**
   * An error the caller answers itself (a plan refusal that opens the
   * paywall): the change is still reverted and the error still thrown, but
   * the generic "could not" notice is not shown.
   */
  quiet?: (error: unknown) => boolean;
  /**
   * What a failed write does to the cache. "snapshot" (default) puts back what
   * was there before the request. "refetch" does not: a snapshot taken at the
   * start would also undo writes that succeeded in the meantime (a wall edited
   * by several quick changes), so the scope is read again from the server.
   */
  rollback?: "snapshot" | "refetch";
}

/** The items route said the board is full (409). */
export function isBoardFull(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

/** The server refused the write because the plan does not allow it. */
export function isUpgradeRequired(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    error.message === "UPGRADE_REQUIRED"
  );
}

function scopes(scope: QueryKey | readonly QueryKey[]): QueryKey[] {
  return Array.isArray(scope[0])
    ? (scope as readonly QueryKey[]).map((k) => k)
    : [scope as QueryKey];
}

/**
 * An optimistic mutation that resolves to `{ result, undo }`.
 *
 * The cache under `scope` is snapshotted, `optimistic` writes the expected
 * state, the request runs, and on failure the snapshot is put back and the
 * person is told through `notify`. `undo()` runs the same mutation with the
 * inverse variables — so an undo is itself optimistic and itself undoable.
 */
export function useUndoableMutation<V, R>(opts: UndoableMutationOptions<V, R>) {
  const qc = useQueryClient();
  const {
    scope,
    label,
    optimistic,
    request,
    inverse,
    inverseFromResult,
    quiet,
    rollback = "snapshot",
  } = opts;

  const run = useCallback(
    async (vars: V): Promise<Undoable<R>> => {
      const keys = scopes(scope);
      await Promise.all(keys.map((k) => qc.cancelQueries({ queryKey: k })));
      const snapshot = keys.flatMap((k) => qc.getQueriesData({ queryKey: k }));
      let back = inverse && !inverseFromResult ? inverse(qc, vars) : null;
      optimistic?.(qc, vars);
      try {
        const result = await request(vars);
        if (inverse && inverseFromResult) back = inverse(qc, vars, result);
        keys.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
        const inverseVars = back;
        return {
          result,
          undo: async () => {
            if (inverseVars == null) return;
            await run(inverseVars);
          },
        };
      } catch (error) {
        if (rollback === "refetch")
          keys.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
        else snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
        if (!quiet?.(error))
          notify.error(`Could not ${label}. Your change was reverted.`);
        void logger.error(
          `v3 mutation failed: ${label}`,
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
        throw error;
      }
    },
    [
      qc,
      scope,
      label,
      optimistic,
      request,
      inverse,
      inverseFromResult,
      quiet,
      rollback,
    ]
  );

  return useMutation<Undoable<R>, Error, V>({ mutationFn: run });
}

/** Patch every cached list under `prefix` whose items have an `id`. */
export function patchListItem<T extends { id: string }>(
  qc: QueryClient,
  prefix: QueryKey,
  id: string,
  patch: (item: T) => T
) {
  qc.setQueriesData<T[]>({ queryKey: prefix }, (list) =>
    Array.isArray(list)
      ? list.map((item) => (item.id === id ? patch(item) : item))
      : list
  );
}

/** Remove an item from every cached list under `prefix`. */
export function dropListItem<T extends { id: string }>(
  qc: QueryClient,
  prefix: QueryKey,
  id: string
) {
  qc.setQueriesData<T[]>({ queryKey: prefix }, (list) =>
    Array.isArray(list) ? list.filter((item) => item.id !== id) : list
  );
}

/** The current copy of one list item, from any cached list under `prefix`. */
export function findListItem<T extends { id: string }>(
  qc: QueryClient,
  prefix: QueryKey,
  id: string
): T | undefined {
  for (const [, list] of qc.getQueriesData<T[]>({ queryKey: prefix })) {
    const hit = Array.isArray(list) ? list.find((i) => i.id === id) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

/** The keys of `patch`, with their values as they are on `current`. */
export function previousFields<T extends object>(
  current: T,
  patch: Partial<T>
): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(patch) as (keyof T)[]) out[k] = current[k];
  return out;
}
