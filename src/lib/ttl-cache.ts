/**
 * A small in-process TTL cache for hot reads that are the same on every call
 * (feature flags, one setting row, a person's personal workspace id).
 *
 * It caches the promise, so callers that ask at the same moment share one
 * read; a read that fails is dropped at once and never cached. It is per
 * process (one serverless instance), so a write elsewhere is seen after at
 * most the TTL; a write in this process clears the cache by name
 * (`clearTtlCaches`).
 *
 * Off under Jest (`NODE_ENV=test`) so a test that changes a mocked read
 * between calls sees the change; a cache test turns it on with
 * `setTtlCachesEnabled(true)`.
 */
import { newDate } from "@/lib/date-utils";

interface Entry<V> {
  expiresAt: number;
  value: Promise<V>;
}

export interface TtlCache<V> {
  /** The cached value for `key`, or the result of `load`, kept for the TTL. */
  get(key: string, load: () => Promise<V>): Promise<V>;
  delete(key: string): void;
  clear(): void;
  readonly size: number;
}

const registry = new Map<string, Set<{ clear(): void }>>();
let enabled = process.env.NODE_ENV !== "test";

/** Turns every cache on or off (tests only). Turning off also empties them. */
export function setTtlCachesEnabled(on: boolean) {
  enabled = on;
  if (!on) clearTtlCaches();
}

/** Empties the caches called `name`, or every cache when no name is given. */
export function clearTtlCaches(name?: string) {
  if (name) {
    registry.get(name)?.forEach((cache) => cache.clear());
    return;
  }
  registry.forEach((caches) => caches.forEach((cache) => cache.clear()));
}

export function createTtlCache<V>(options: {
  name: string;
  ttlMs: number;
  /** Past this many keys the oldest entry is dropped to make room. */
  maxEntries?: number;
  now?: () => number;
}): TtlCache<V> {
  const {
    name,
    ttlMs,
    maxEntries = 5000,
    now = () => newDate().getTime(),
  } = options;
  const entries = new Map<string, Entry<V>>();

  const cache: TtlCache<V> = {
    get(key, load) {
      if (!enabled) return load();
      const at = now();
      const hit = entries.get(key);
      if (hit && hit.expiresAt > at) return hit.value;
      if (hit) entries.delete(key);
      // Past the cap the oldest entry goes (first in, first out; a Map keeps
      // insertion order). It is not least-recently-used.
      while (entries.size >= maxEntries) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
      }
      const value = load();
      const entry: Entry<V> = { expiresAt: at + ttlMs, value };
      entries.set(key, entry);
      value.catch(() => {
        if (entries.get(key) === entry) entries.delete(key);
      });
      return value;
    },
    delete(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  };

  let group = registry.get(name);
  if (!group) registry.set(name, (group = new Set()));
  group.add(cache);
  return cache;
}
