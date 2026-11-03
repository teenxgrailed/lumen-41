/**
 * A page whose HTML came from one build and whose CSS or JS chunks are gone
 * (a deploy swapped the container, or a stale copy was served) paints nothing
 * and never hydrates. The failure is a 404 on a `/_next/static/` file, or a
 * `ChunkLoadError`. The cure is one reload that asks the server for the new
 * HTML and drops this build's static caches; a second failure inside a minute
 * is left alone, so a genuinely missing file cannot loop the page.
 *
 * `installChunkReloadGuard` is serialised into an inline script in the root
 * layout (`CHUNK_RELOAD_SCRIPT`), because when the bundle itself fails to load
 * no React code runs to notice. Like `applyThemeToRoot` in `theme-init.ts` it
 * must stay self-contained: no imports, no module-scope references, nothing
 * read from `window` or `document` (the environment is the `win` argument).
 *
 * Returns a function that removes the listeners.
 */
export interface ChunkGuardWindow {
  addEventListener: (
    type: string,
    listener: (event: never) => void,
    capture?: boolean
  ) => void;
  removeEventListener: (
    type: string,
    listener: (event: never) => void,
    capture?: boolean
  ) => void;
  sessionStorage: Pick<Storage, "getItem" | "setItem">;
  location: { reload: () => void };
  caches?: Pick<CacheStorage, "keys" | "delete">;
}

export function installChunkReloadGuard(win: ChunkGuardWindow): () => void {
  const KEY = "needt-asset-reload";
  const isAsset = (el: unknown): boolean => {
    const node = el as {
      tagName?: string;
      src?: string;
      href?: string;
      rel?: string;
    } | null;
    if (!node || !node.tagName) return false;
    const tag = node.tagName.toUpperCase();
    const url = tag === "SCRIPT" ? node.src : tag === "LINK" ? node.href : "";
    if (!url || url.indexOf("/_next/static/") === -1) return false;
    return tag === "SCRIPT" || /stylesheet|preload/i.test(node.rel || "");
  };
  const isChunkMessage = (reason: unknown): boolean => {
    const r = reason as { name?: string; message?: string } | string | null;
    const text =
      r && typeof r === "object"
        ? String(r.name || "") + " " + String(r.message || "")
        : String(r || "");
    return /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
      text
    );
  };
  const reload = () => {
    try {
      const last = Number(win.sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last < 60000) return;
      win.sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      // Storage is blocked: no way to tell a loop, so do nothing.
      return;
    }
    const done = () => win.location.reload();
    const store = win.caches;
    if (!store) {
      done();
      return;
    }
    store
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.indexOf("needt-private-") !== 0)
            .map((key) => store.delete(key))
        )
      )
      .then(done, done);
  };
  const onError = (event: { target?: unknown; error?: unknown }) => {
    if (isAsset(event.target) || isChunkMessage(event.error)) reload();
  };
  const onRejection = (event: { reason?: unknown }) => {
    if (isChunkMessage(event.reason)) reload();
  };
  // Capture: a failed <link> or <script> does not bubble its error event.
  win.addEventListener("error", onError as (event: never) => void, true);
  win.addEventListener(
    "unhandledrejection",
    onRejection as (event: never) => void
  );
  return () => {
    win.removeEventListener("error", onError as (event: never) => void, true);
    win.removeEventListener(
      "unhandledrejection",
      onRejection as (event: never) => void
    );
  };
}

export const CHUNK_RELOAD_SCRIPT = `(function () {
  try {
    (${installChunkReloadGuard.toString()})(window);
  } catch (e) {}
})();`;
