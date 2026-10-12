"use client";

import { type ReactNode, useState } from "react";

import * as Dropdown from "@radix-ui/react-dropdown-menu";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { useExit } from "../ctx/useExit";
import { Art, type ArtName } from "./Art";

export type RichMenuItem =
  | { sep: true }
  | {
      sep?: false;
      art: ArtName;
      title: string;
      sub?: string;
      kbd?: string;
      disabled?: boolean;
      onClick?: () => void;
    };

type Row = Exclude<RichMenuItem, { sep: true }>;

/** Big row: 40px picture, title and one line of why, hairline below. */
function RichRow({ it, i, last }: { it: Row; i: number; last: boolean }) {
  const [hot, setHot] = useState(false);
  return (
    <Dropdown.Item
      className="nx-swap shell-rich-row-row"
      disabled={it.disabled}
      onSelect={() => it.onClick?.()}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
      style={{
        animationDelay: `${40 + i * 30}ms`,
        background: hot ? "var(--fill-3)" : "transparent",
        outline: "none",
        opacity: it.disabled ? 0.5 : undefined,
      }}
    >
      <span
        className="nx-art shell-sidebar-toggle-row-2"
        style={{ transform: hot ? "translateY(-1px) scale(1.04)" : "none" }}
      >
        <Art name={it.art} />
      </span>
      <span className="base-stack shell-rich-row-stack">
        <span className="shell-whats-new-text-2">{it.title}</span>
        {it.sub ? <span className="shell-rich-row-text">{it.sub}</span> : null}
      </span>
      {it.kbd ? (
        <span className="base-meta shell-rich-row-text-2">{it.kbd}</span>
      ) : null}
      {!last ? (
        <span className="shell-rich-row-layer" aria-hidden="true" />
      ) : null}
    </Dropdown.Item>
  );
}

/** Compact row: 22px picture and a 13px title (import, convert, pick one). */
function SmallRow({ it, i }: { it: Row; i: number }) {
  const [hot, setHot] = useState(false);
  return (
    <Dropdown.Item
      className="nx-swap shell-small-row-menuitem"
      disabled={it.disabled}
      onSelect={() => it.onClick?.()}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
      style={{
        background: hot ? "var(--fill-3)" : "transparent",
        animationDuration: "220ms",
        animationDelay: `${30 + i * 22}ms`,
        outline: "none",
        opacity: it.disabled ? 0.5 : undefined,
      }}
    >
      <span
        className="shell-small-row-row"
        style={{ transform: hot ? "scale(1.08)" : "none" }}
      >
        <Art name={it.art} size={22} />
      </span>
      <span className="shell-small-row-span">{it.title}</span>
      {it.kbd ? (
        <span className="base-meta shell-rich-row-text-2">{it.kbd}</span>
      ) : null}
    </Dropdown.Item>
  );
}

/**
 * The rich menu (prototype popovers.jsx RichMenu) on Radix DropdownMenu:
 * keyboard, focus and outside-click come from Radix; the look and the
 * enter/exit motion are the prototype's.
 *
 * Big rows are for the main "create" choices; `small` is everything else.
 * `trigger` may be a function of `open`, so the trigger can show its state.
 */
export function RichMenu({
  trigger,
  items,
  width,
  align = "left",
  up = false,
  block = false,
  small = false,
  prompt,
}: {
  trigger: ReactNode | ((open: boolean) => ReactNode);
  items: readonly RichMenuItem[];
  width?: number;
  align?: "left" | "right";
  up?: boolean;
  block?: boolean;
  small?: boolean;
  prompt?: string;
}) {
  const container = useV3PortalContainer();
  const [open, setOpen] = useState(false);
  const [shown, leaving] = useExit(open, 130);
  const w = width ?? (small ? 248 : 300);
  return (
    <Dropdown.Root open={open} onOpenChange={setOpen} modal={false}>
      <span
        className="shell-mini-month-div"
        style={{ display: block ? "block" : "inline-flex" }}
      >
        <Dropdown.Trigger asChild>
          {typeof trigger === "function" ? trigger(open) : trigger}
        </Dropdown.Trigger>
      </span>
      {shown && container ? (
        <Dropdown.Portal container={container} forceMount>
          <Dropdown.Content
            forceMount
            side={up ? "top" : "bottom"}
            align={align === "right" ? "end" : "start"}
            sideOffset={8}
            collisionPadding={8}
            className={
              (up ? "nx-up" : "nx-pop") +
              (align === "right" ? " is-right" : "") +
              (leaving ? " is-leaving" : "")
            }
            style={{
              zIndex: 1100,
              width: w,
              padding: 6,
              boxSizing: "border-box",
              borderRadius: small ? 14 : 18,
              background: "var(--surface-raised)",
              boxShadow: "var(--shadow-floating)",
              display: "flex",
              flexDirection: "column",
              gap: small ? 0 : 1,
              outline: "none",
              transformOrigin:
                (up ? "bottom " : "top ") +
                (align === "right" ? "right" : "left"),
            }}
          >
            {prompt ? (
              <div className="shell-rich-menu-text">{prompt}</div>
            ) : null}
            {items.map((it, i) =>
              it.sep ? (
                <span
                  className="shell-rich-menu-bar"
                  key={`sep${i}`}
                  aria-hidden="true"
                />
              ) : small ? (
                <SmallRow key={it.title} i={i} it={it} />
              ) : (
                <RichRow
                  key={it.title}
                  i={i}
                  it={it}
                  last={i === items.length - 1}
                />
              )
            )}
          </Dropdown.Content>
        </Dropdown.Portal>
      ) : null}
    </Dropdown.Root>
  );
}
