"use client";

/* THE STACK'S STATE, AND THE WAY IN.
 *
 * `window.__notify` became two contexts. Two rather than one because the two
 * audiences are different: nearly everything only ever FIRES a notice, and a
 * caller that fires should not re-render every time an unrelated card arrives
 * or leaves. So the api is stable for its whole life and the stack's contents
 * live beside it.
 *
 * The payload is unchanged from the prototype — see `types.ts`.
 */
import * as React from "react";

import {
  DISMISS_MS,
  type DismissClock,
  LEAVE_MS,
  keep,
  startDismissClock,
} from "./stack";
import type { Notice, NoticeApi, NoticePayload, NoticeStack } from "./types";

const ApiContext = React.createContext<NoticeApi | null>(null);
const StackContext = React.createContext<NoticeStack | null>(null);

/* Ids are a counter, not a clock: nothing about a notice depends on when it
   arrived, and a counter cannot collide inside one frame. */
let issued = 0;
function nextId(): string {
  issued += 1;
  return `nf-${issued}`;
}

export function NeedtNoticeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notices, setNotices] = React.useState<readonly Notice[]>([]);

  /* A ref rather than state: the dismiss clock reads it from inside a timer,
     and a re-render on hover would restart every animation in the stack. */
  const held = React.useRef(false);
  const clocks = React.useRef(new Map<string, DismissClock>());
  const leaving = React.useRef(new Set<ReturnType<typeof setTimeout>>());

  const dismiss = React.useCallback((id: string) => {
    /* Leave first, then go. A card that disappears on the frame you click it
       leaves the stack jumping, and you cannot tell which one left. */
    setNotices((list) =>
      list.map((n) => (n.id === id ? { ...n, leaving: true } : n))
    );

    const clock = clocks.current.get(id);
    if (clock) {
      clock.cancel();
      clocks.current.delete(id);
    }

    const timer = setTimeout(() => {
      leaving.current.delete(timer);
      setNotices((list) => list.filter((n) => n.id !== id));
    }, LEAVE_MS);
    leaving.current.add(timer);
  }, []);

  const dismissAll = React.useCallback(() => {
    setNotices((list) => {
      list.forEach((n) => {
        const clock = clocks.current.get(n.id);
        if (clock) {
          clock.cancel();
          clocks.current.delete(n.id);
        }
      });
      return [];
    });
  }, []);

  const notify = React.useCallback(
    (payload: NoticePayload) => {
      const id = nextId();
      setNotices((list) => {
        /* A keyed notice takes the place of the last one of its name rather
           than stacking beside it — and keeps that place, so a status that
           updates does not jump to the bottom on every change. */
        if (payload.key) {
          const at = list.findIndex((n) => n.key === payload.key && !n.leaving);
          if (at >= 0) {
            const previous = list[at];
            const clock = clocks.current.get(previous.id);
            if (clock) {
              clock.cancel();
              clocks.current.delete(previous.id);
            }
            const next = list.slice();
            next[at] = { ...payload, id };
            return next;
          }
        }
        return keep(list, { ...payload, id });
      });

      if (!payload.sticky) {
        clocks.current.set(
          id,
          startDismissClock({
            delay: payload.ms ?? DISMISS_MS,
            held: () => held.current,
            onDismiss: () => dismiss(id),
          })
        );
      }

      return id;
    },
    [dismiss]
  );

  React.useEffect(() => {
    const running = clocks.current;
    const pending = leaving.current;
    return () => {
      running.forEach((clock) => clock.cancel());
      running.clear();
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const api = React.useMemo<NoticeApi>(
    () => ({ notify, dismiss, dismissAll }),
    [notify, dismiss, dismissAll]
  );

  const stack = React.useMemo<NoticeStack>(
    () => ({
      notices,
      hold: () => {
        held.current = true;
      },
      release: () => {
        held.current = false;
      },
    }),
    [notices]
  );

  return (
    <ApiContext.Provider value={api}>
      <StackContext.Provider value={stack}>{children}</StackContext.Provider>
    </ApiContext.Provider>
  );
}

/** Raise and drop notices from anywhere inside the corner's provider. */
export function useNotify(): NoticeApi {
  const api = React.useContext(ApiContext);
  if (!api) {
    throw new Error("useNotify must be used inside <NeedtNoticeProvider>.");
  }
  return api;
}

/** What the stack itself reads. Nothing else should need this. */
export function useNoticeStack(): NoticeStack {
  const stack = React.useContext(StackContext);
  if (!stack) {
    throw new Error(
      "useNoticeStack must be used inside <NeedtNoticeProvider>."
    );
  }
  return stack;
}
