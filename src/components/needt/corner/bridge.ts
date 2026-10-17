"use client";

/* THE WAY IN FROM OUTSIDE REACT.
 *
 * The corner's `notify` is a hook, which is right for the corner and no use
 * to the two hundred places in this product that raise a message — a Zustand
 * action, a fetch handler, a catch block. Those call the `notify` facade in
 * `@/lib/notifications`, a plain function, and this is how that function
 * reaches the mounted stacks.
 *
 * There are two stacks, one per surface (see `NoticeSurface`): the action
 * toasts at the bottom centre, and the island in the bottom-right corner.
 * Each registers its own sink on mount; a notice goes to the one its payload
 * names, `toast` when it names none.
 *
 * Anything raised before its stack exists is queued rather than dropped: the
 * first message a session shows is usually the one that fired while the page
 * was still mounting.
 */
import type { NoticeApi, NoticePayload, NoticeSurface } from "./types";

/** A raise that arrived before the stack did. */
interface Pending {
  payload: NoticePayload;
  /** The id the caller was already handed, so a later dismiss still finds it. */
  id: string;
}

interface Channel {
  live: NoticeApi | null;
  queued: Pending[];
  dismissedBeforeMount: Set<string>;
}

const channels: Record<NoticeSurface, Channel> = {
  toast: { live: null, queued: [], dismissedBeforeMount: new Set() },
  island: { live: null, queued: [], dismissedBeforeMount: new Set() },
};

/* Ids handed out before the stack exists. They have to be stable, because a
   caller may dismiss one before the stack has ever rendered. */
let issued = 0;
function pendingId(): string {
  issued += 1;
  return `nf-pending-${issued}`;
}

/** Pending id → the id the stack gave the same notice once it mounted. */
const aliases = new Map<string, string>();
/** Pending id → the surface it was queued for. */
const pendingSurface = new Map<string, NoticeSurface>();

/**
 * The provider calls this on mount, and with `null` on unmount. The island
 * is the default surface for callers that predate the toast.
 */
export function setNoticeSink(
  api: NoticeApi | null,
  surface: NoticeSurface = "island"
): void {
  const channel = channels[surface];
  channel.live = api;
  if (!api) return;

  const flushing = channel.queued;
  channel.queued = [];
  const dropped = channel.dismissedBeforeMount;
  channel.dismissedBeforeMount = new Set();

  for (const item of flushing) {
    pendingSurface.delete(item.id);
    if (dropped.has(item.id)) continue;
    const real = api.notify(item.payload);
    /* A caller holding the pending id has to be able to dismiss the real
       card, so the two are kept married until one of them goes. */
    aliases.set(item.id, real);
  }
}

export function raiseNotice(payload: NoticePayload): string {
  const surface: NoticeSurface = payload.surface ?? "toast";
  const channel = channels[surface];
  if (channel.live) return channel.live.notify(payload);
  const id = pendingId();
  channel.queued.push({ payload, id });
  pendingSurface.set(id, surface);
  return id;
}

export function dropNotice(id?: string): void {
  if (!id) {
    /* No id means "whatever is up". The stack has no clear-all, so this is
       every card it is currently holding. */
    for (const channel of Object.values(channels)) {
      channel.queued = [];
      channel.live?.dismissAll?.();
    }
    return;
  }
  const real = aliases.get(id) ?? id;
  aliases.delete(id);
  const waiting = pendingSurface.get(id);
  if (waiting) {
    const channel = channels[waiting];
    pendingSurface.delete(id);
    channel.queued = channel.queued.filter((item) => item.id !== id);
    channel.dismissedBeforeMount.add(id);
    return;
  }
  /* Real ids are one counter across both stacks, so the one that does not
     own it ignores the call. */
  for (const channel of Object.values(channels)) channel.live?.dismiss(real);
}
