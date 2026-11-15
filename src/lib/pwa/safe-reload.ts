/**
 * Reloads the page for a new version without ever costing the person work.
 * There is no button and no toast: when the server runs a newer build than the
 * page, the reload is requested, and it fires ONLY at a moment that is safe by
 * construction:
 *
 * - the next route change, or the tab becoming hidden; AND
 * - nothing is dirty: no open dialog, no field or contenteditable the person
 *   typed into that still holds text, no form whose value differs from its
 *   default, no iframe holding focus, no unsaved page (`unsaved-work.ts`).
 *
 * Never on blur or focus-leave. If no safe moment comes, it keeps waiting: no
 * reload is better than a lost draft. When it fires, the loading word is
 * shown and the reload follows `COMMIT_MS` later so the word has painted. If
 * the reload is cancelled (a beforeunload "Stay"), the word is cleared after
 * `COMMIT_MS + CANCEL_GRACE_MS` and the request stays open, but the loop guard
 * is never reset: a cancelled reload waits out the minute. Once `pagehide` has
 * fired the page is already leaving (a slow reload keeps this document's timers
 * alive until the new response arrives), so nothing is cancelled then. At most
 * one reload per minute (`sessionStorage`), and none at all
 * when storage is unavailable, so a stale CDN cannot loop the page.
 */
import { hasUnsavedWork } from "./unsaved-work";

export const COMMIT_MS = 400;
export const CANCEL_GRACE_MS = 1000;
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

function holdsText(el: Element): boolean {
  const node = el as HTMLInputElement;
  if (typeof node.value === "string") return node.value.length > 0;
  return (el.textContent ?? "").trim().length > 0;
}

/** A form control whose value is not the one it was rendered with. */
function differsFromDefault(el: Element): boolean {
  const tag = el.tagName.toUpperCase();
  if (tag === "SELECT")
    return Array.from((el as HTMLSelectElement).options).some(
      (o) => o.selected !== o.defaultSelected
    );
  if (tag === "TEXTAREA")
    return (
      (el as HTMLTextAreaElement).value !==
      (el as HTMLTextAreaElement).defaultValue
    );
  if (tag === "INPUT") {
    const input = el as HTMLInputElement;
    if (input.type === "checkbox" || input.type === "radio")
      return input.checked !== input.defaultChecked;
    if (TEXT_INPUT_TYPES.has((input.type || "text").toLowerCase()))
      return input.value !== input.defaultValue;
  }
  return false;
}

export interface SafeReload {
  /** A newer build exists: reload at the next safe moment. */
  request(): void;
  /** The route changed: a safe moment if nothing is dirty. */
  routeChanged(): void;
  dispose(): void;
}

export function createSafeReload(args: {
  doc: Document;
  /** The word goes up. */
  onCommit: () => void;
  /** The reload did not happen (cancelled): the word comes down. */
  onCancel?: () => void;
  reload: () => void;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  now?: () => number;
}): SafeReload {
  const { doc, onCommit, reload } = args;
  const now = args.now ?? Date.now;
  let pending = false;
  let committed = false;
  let leaving = false;
  // Fields typed into since the gate was created (that is, since mount).
  const typed = new WeakSet<object>();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  const dirty = (): boolean => {
    if (hasUnsavedWork()) return true;
    if (doc.querySelector('[role="dialog"], dialog[open]')) return true;
    if (doc.activeElement?.tagName?.toUpperCase() === "IFRAME") return true;
    for (const el of Array.from(
      doc.querySelectorAll(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
      )
    )) {
      if (typed.has(el) && holdsText(el)) return true;
    }
    for (const form of Array.from(doc.forms)) {
      for (const el of Array.from(form.elements)) {
        if (differsFromDefault(el)) return true;
      }
    }
    return false;
  };

  const looped = () => {
    // Storage is missing or blocked: no way to tell a loop, so do nothing.
    if (!args.storage) return true;
    try {
      const last = Number(args.storage.getItem(LOOP_KEY) || 0);
      return now() - last < LOOP_WINDOW_MS;
    } catch {
      return true;
    }
  };

  const attempt = () => {
    if (!pending || committed || dirty() || looped()) return;
    committed = true;
    try {
      args.storage?.setItem(LOOP_KEY, String(now()));
    } catch {
      /* looped() refuses when storage throws */
    }
    onCommit();
    later(reload, COMMIT_MS);
    // Still here after the reload should have gone: it was cancelled.
    later(() => {
      // The page is leaving, only slowly: this is not a cancel.
      if (leaving) return;
      committed = false;
      args.onCancel?.();
    }, COMMIT_MS + CANCEL_GRACE_MS);
  };

  const onInput = (event: Event) => {
    const target = event.target as Element | null;
    if (target && isEditable(target)) typed.add(target);
  };
  const onPageHide = () => {
    leaving = true;
  };
  const onVisibility = () => {
    if (doc.visibilityState === "hidden") attempt();
  };

  doc.addEventListener("input", onInput, true);
  doc.addEventListener("visibilitychange", onVisibility);
  const win = doc.defaultView;
  win?.addEventListener("pagehide", onPageHide);

  return {
    request() {
      pending = true;
      // A tab that is already hidden is already at a safe moment.
      if (doc.visibilityState === "hidden") attempt();
    },
    routeChanged() {
      attempt();
    },
    dispose() {
      doc.removeEventListener("input", onInput, true);
      doc.removeEventListener("visibilitychange", onVisibility);
      win?.removeEventListener("pagehide", onPageHide);
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
}

/** The real reload. A module of its own so tests can stand in for it. */
export function reloadPage() {
  window.location.reload();
}
