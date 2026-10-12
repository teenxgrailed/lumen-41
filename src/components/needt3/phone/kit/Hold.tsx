"use client";

import { type HTMLAttributes, type ReactNode, useEffect, useRef } from "react";

import { LuCheck, LuChevronRight } from "react-icons/lu";

import { HOLD_MS, holdMoved } from "@/lib/needt3/gesture";
import { haptic } from "@/lib/needt3/platform";

import { PkHueTile } from "./Material";
import { PkSheet } from "./Sheet";
import { pkAbortGestures } from "./pointer";
import { pkCx } from "./util";

/* ══ Hold → actions ═══════════════════════════════════════════════════════
   The phone has no hover and no right-click: what the desktop keeps in a
   context menu is a long press here, and the menu is a glass sheet. */

interface HoldState {
  t: number;
  fired: boolean;
  x: number;
  y: number;
  id: number | null;
  el: Element | null;
}

/**
 * A box that fires `onHold` after a 450 ms press that has not travelled
 * (8 px), or on contextmenu (a mouse's right click, iOS's own long press).
 * The click that ends a hold is swallowed, and the pointer is captured at that
 * moment so the sheet that opens under the finger never gets the release. A
 * swipe or a scroll that starts on it cancels it.
 */
export function PkHold({
  onHold,
  className,
  children,
  data,
  disabled,
}: {
  onHold?: () => void;
  className?: string;
  children?: ReactNode;
  /** Extra `data-*` attributes for the box. */
  data?: Record<string, string>;
  disabled?: boolean;
}) {
  const s = useRef<HoldState>({
    t: 0,
    fired: false,
    x: 0,
    y: 0,
    id: null,
    el: null,
  });
  const hold = useRef(onHold);
  hold.current = onHold;
  const clear = () => {
    window.clearTimeout(s.current.t);
    s.current.t = 0;
  };
  useEffect(() => clear, []);
  const fire = () => {
    const st = s.current;
    st.t = 0;
    st.fired = true;
    // Let go of the finger everywhere else (a row swipe, the pull-down, a
    // sheet drag) without committing: the abort bus, not a synthetic
    // pointercancel with zero coordinates.
    pkAbortGestures(st.id ?? undefined);
    try {
      if (st.el && st.id != null)
        (st.el as HTMLElement).setPointerCapture(st.id);
    } catch {
      /* the pointer already left */
    }
    haptic("light");
    hold.current?.();
  };
  const props: HTMLAttributes<HTMLDivElement> = disabled
    ? {}
    : {
        onPointerDown: (e) => {
          if (e.button) return;
          clear();
          Object.assign(s.current, {
            x: e.clientX,
            y: e.clientY,
            id: e.pointerId,
            el: e.currentTarget,
            fired: false,
          });
          s.current.t = window.setTimeout(fire, HOLD_MS);
        },
        onPointerMove: (e) => {
          if (
            s.current.t &&
            holdMoved(e.clientX - s.current.x, e.clientY - s.current.y)
          )
            clear();
        },
        onPointerUp: clear,
        onPointerCancel: clear,
        onContextMenu: (e) => {
          e.preventDefault();
          if (s.current.fired) return;
          clear();
          s.current.fired = true;
          hold.current?.();
        },
        onClickCapture: (e) => {
          if (s.current.fired) {
            s.current.fired = false;
            e.stopPropagation();
            e.preventDefault();
          }
        },
      };
  return (
    <div className={pkCx("pk-hold", className)} {...props} {...(data ?? {})}>
      {children}
    </div>
  );
}

export interface PkAction {
  label: string;
  hint?: string;
  /** An icon node (react-icons) on the coloured tile. */
  icon?: ReactNode;
  hue?: string;
  /** A phone place id: the tile draws that place's glyph. */
  glyph?: string;
  danger?: boolean;
  check?: boolean;
  more?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  data?: Record<string, string>;
}

export interface PkActs {
  title?: string;
  meta?: ReactNode;
  head?: ReactNode;
  actions: (PkAction | false | null | undefined)[];
}

/**
 * One frosted PkSheet with a list of glass action rows, each led by a
 * coloured tile. The sheet closes, then the action runs (in the same tap, so
 * a file picker it opens keeps the user's gesture). Pass `null` to close; the
 * last list stays drawn while the sheet slides away.
 */
export function PkActions({
  acts,
  onClose,
}: {
  acts: PkActs | null;
  onClose: () => void;
}) {
  const last = useRef<PkActs | null>(null);
  if (acts) last.current = acts;
  const a = acts ?? last.current;
  return (
    <PkSheet
      open={!!acts}
      onClose={onClose}
      title={a?.title ?? ""}
      meta={a?.meta ?? null}
      head={a?.head ?? null}
      label={a?.title || "Actions"}
      className="pk-acts-sheet"
    >
      {a ? (
        <div className="pk-acts" role="menu" aria-label={a.title || "Actions"}>
          {a.actions
            .filter((x): x is PkAction => !!x)
            .map((x) => (
              <button
                key={x.label}
                type="button"
                role="menuitem"
                className={pkCx("pk-act", x.danger && "is-danger")}
                disabled={x.disabled}
                onClick={() => {
                  onClose();
                  x.onClick?.();
                }}
                {...(x.data ?? {})}
              >
                <PkHueTile
                  icon={x.icon}
                  hue={x.danger ? "var(--destructive)" : x.hue}
                  glyph={x.glyph}
                />
                <span className="pk-act-text">
                  <span className="pk-act-label">{x.label}</span>
                  {x.hint ? (
                    <span className="pk-act-hint">{x.hint}</span>
                  ) : null}
                </span>
                {x.check ? (
                  <span className="pk-act-check">
                    <LuCheck size={18} />
                  </span>
                ) : x.more ? (
                  <span className="pk-act-check">
                    <LuChevronRight size={16} />
                  </span>
                ) : null}
              </button>
            ))}
        </div>
      ) : null}
    </PkSheet>
  );
}
