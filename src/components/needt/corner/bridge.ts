"use client";

/* THE WAY IN FROM OUTSIDE REACT.
 *
 * The corner's `notify` is a hook, which is right for the corner and no use
 * to the two hundred places in this product that raise a message — a Zustand
 * action, a fetch handler, a catch block. Those call the `notify` facade in
 * `@/lib/notifications`, a plain function, and this is how that function
 * reaches the mounted stack.
 *
 * One registry, filled by the provider on mount. Anything raised before the
 * stack exists is queued rather than dropped: the first message a session
 * shows is usually the one that fired while the page was still mounting.
 */
import type { NoticeApi, NoticePayload } from "./types";

/** A raise that arrived before the stack did. */
interface Pending {
  payload: NoticePayload;
  /** The id the caller was already handed, so a later dismiss still finds it. */
  id: string;
}

let live: NoticeApi | null = null;
let queued: Pending[] = [];
let dismissedBeforeMount = new Set<string>();

/* Ids handed out before the stack exists. They have to be stable, because a
   caller may dismiss one before the stack has ever rendered. */
let issued = 0;
function pendingId(): string {
  issued += 1;
  return `nf-pending-${issued}`;
}

/** The provider calls this on mount, and with `null` on unmount. */
export function setNoticeSink(api: NoticeApi | null): void {
  live = api;
  if (!api) return;

  const flushing = queued;
  queued = [];
  const dropped = dismissedBeforeMount;
  dismissedBeforeMount = new Set();

  for (const item of flushing) {
    if (dropped.has(item.id)) continue;
    const real = api.notify(item.payload);
    /* A caller holding the pending id has to be able to dismiss the real
       card, so the two are kept married until one of them goes. */
    aliases.set(item.id, real);
  }
}

/** Pending id → the id the stack gave the same notice once it mounted. */
const aliases = new Map<string, string>();

export function raiseNotice(payload: NoticePayload): string {
  if (live) return live.notify(payload);
  const id = pendingId();
  queued.push({ payload, id });
  return id;
}

export function dropNotice(id?: string): void {
  if (!id) {
    /* No id means "whatever is up". The stack has no clear-all, so this is
       every card it is currently holding. */
    queued = [];
    live?.dismissAll?.();
    return;
  }
  const real = aliases.get(id) ?? id;
  aliases.delete(id);
  if (live) {
    live.dismiss(real);
    return;
  }
  queued = queued.filter((item) => item.id !== id);
  dismissedBeforeMount.add(id);
}
