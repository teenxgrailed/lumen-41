import { useEffect, useState, useSyncExternalStore } from "react";

import { useSearchParams } from "next/navigation";

/**
 * The URL after one search param changes, as a path + query + hash. Pure so
 * the open/close of the task window (`?task=<id>`) can be tested without a
 * router.
 */
export function withParam(
  href: string,
  key: string,
  value: string | null
): string {
  const url = new URL(href, "http://needt.invalid");
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}

/*
 * The open task window: a one-value store, so only the dialog slot renders
 * when it opens, not the whole list under it. The URL follows through
 * `history.replaceState`: `router.replace` to a new query on the
 * force-dynamic layout waits for a server round trip, and that wait was the
 * lag between a click and the window.
 */
let openId: string | null = null;
const listeners = new Set<() => void>();

function put(id: string | null) {
  if (id === openId) return;
  openId = id;
  for (const l of listeners) l();
}

/** Open (or, with null, close) the task window. Stable, safe in any handler. */
export function setOpenTask(id: string | null) {
  put(id);
  if (typeof window === "undefined") return;
  const { pathname, search, hash } = window.location;
  window.history.replaceState(
    window.history.state,
    "",
    withParam(pathname + search + hash, "task", id)
  );
}

/**
 * The open task id. A `?task=` that arrives from outside (Home, Calendar, a
 * link) is taken from `useSearchParams`.
 */
export function useOpenTask(): string | null {
  const fromUrl = useSearchParams().get("task");
  // a fresh mount starts from the URL, not from what an earlier screen left
  useState(() => {
    openId = fromUrl;
  });
  useEffect(() => put(fromUrl), [fromUrl]);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => openId,
    () => fromUrl
  );
}
