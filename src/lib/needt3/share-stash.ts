/**
 * The files a share sheet handed over, kept by the service worker in the Cache
 * API (`receiveShare` in public/sw.js) because a redirect cannot carry them.
 * Client only; every failure reads as "no files".
 */
import { SHARE_CACHE } from "@/lib/needt3/share-target";

const key = (id: string, index: number) => `/__share/${id}/${index}`;

export async function readStash(id: string, count: number): Promise<File[]> {
  if (typeof caches === "undefined" || !count) return [];
  try {
    const cache = await caches.open(SHARE_CACHE);
    const files: File[] = [];
    for (let i = 0; i < count; i++) {
      const res = await cache.match(key(id, i));
      if (!res) continue;
      const blob = await res.blob();
      let name = `file-${i}`;
      try {
        name = decodeURIComponent(res.headers.get("x-needt-name") ?? name);
      } catch {
        /* keep the generic name */
      }
      files.push(
        new File([blob], name, {
          type: res.headers.get("content-type") || blob.type,
        })
      );
    }
    return files;
  } catch {
    return [];
  }
}

/** Forget the files once they are saved or the person closed the sheet. */
export async function clearStash(id: string, count: number): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(SHARE_CACHE);
    await Promise.all(
      Array.from({ length: Math.max(count, 10) }, (_, i) =>
        cache.delete(key(id, i))
      )
    );
  } catch {
    /* nothing to clear */
  }
}
