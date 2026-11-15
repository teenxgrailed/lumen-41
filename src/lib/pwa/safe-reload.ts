/**
 * Reloads the page for a new version without losing what the person is
 * writing. There is no button and no toast: when the server runs a newer build
 * than the page, the loading word is shown and the page reloads on its own,
 * at the first safe moment:
 *
 * - safe means no text field or contenteditable has focus with changes typed
 *   into it since it took focus (a focused field nobody typed in is safe);
 * - a route change is always safe, whether or not a field is dirty: the
 *   person is leaving that screen, and the reload lands on the new one;
 * - a hidden tab is safe too (nothing is being typed there).
 *
 * `request()` is idempotent. Once committed, the word is shown and the reload
 * follows after `COMMIT_MS`, so the word has been painted before the page goes.
 * One reload per minute at most (`sessionStorage`), so a CDN still serving the
 * old build cannot loop the page.
 */

export const COMMIT_MS = 400;
const LOOP_KEY = "needt-version-reload";
const LOOP_WINDOW_MS = 60_000;

const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);

/** A control the person types into. */
export function isEditable(el: Element | null | undefined): boolean {
  if (!el) return false;
  const node = el as HTMLElement;
  if (node.isContentEditable) return true;
  const tag = node.tagName?.toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT")
    return TEXT_INPUT_TYPES.has(
      ((node as HTMLInputElement).type || "text").toLowerCase()
    );
  return false;
}

export interface SafeReload {
  /** A newer build exists: reload as soon as it is safe. */
  request(): void;
  /** The route changed: that is always a safe moment. */
  routeChanged(): void;
  dispose(): void;
}

export function createSafeReload(args: {
  doc: Document;
  /** The word goes up. */
  onCommit: () => void;
  reload: () => void;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  now?: () => number;
}): SafeReload {
  const { doc, onCommit, reload } = args;
  const now = args.now ?? Date.now;
  let pending = false;
  let committed = false;
  // The field that has had text typed into it since it took focus.
  let dirty: EventTarget | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  const unsafe = () => {
    if (doc.visibilityState === "hidden") return false;
    const active = doc.activeElement;
    return isEditable(active) && dirty !== null && dirty === active;
  };

  const looped = () => {
    try {
      const last = Number(args.storage?.getItem(LOOP_KEY) || 0);
      return now() - last < LOOP_WINDOW_MS;
    } catch {
      // Storage is blocked: no way to tell a loop, so do nothing.
      return true;
    }
  };

  const commit = () => {
    if (committed || !pending) return;
    if (looped()) return;
    committed = true;
    try {
      args.storage?.setItem(LOOP_KEY, String(now()));
    } catch {
      /* looped() already refused when storage throws */
    }
    onCommit();
    later(reload, COMMIT_MS);
  };

  const attempt = () => {
    if (pending && !committed && !unsafe()) commit();
  };

  const onInput = (event: Event) => {
    if (isEditable(event.target as Element)) dirty = event.target;
  };
  const onFocusIn = (event: Event) => {
    // A new field starts clean; coming back to the same one keeps its mark.
    if (dirty !== event.target) dirty = null;
  };
  // `activeElement` has not moved yet inside focusout; look one turn later.
  const onFocusOut = () => later(attempt, 0);
  const onVisibility = () => attempt();

  doc.addEventListener("input", onInput, true);
  doc.addEventListener("focusin", onFocusIn, true);
  doc.addEventListener("focusout", onFocusOut, true);
  doc.addEventListener("visibilitychange", onVisibility);

  return {
    request() {
      pending = true;
      attempt();
    },
    routeChanged() {
      commit();
    },
    dispose() {
      doc.removeEventListener("input", onInput, true);
      doc.removeEventListener("focusin", onFocusIn, true);
      doc.removeEventListener("focusout", onFocusOut, true);
      doc.removeEventListener("visibilitychange", onVisibility);
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
}

/** The real reload. A module of its own so tests can stand in for it. */
export function reloadPage() {
  window.location.reload();
}
