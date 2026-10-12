"use client";

import { type ReactNode, useState } from "react";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { FiCheck, FiChevronDown, FiLock } from "react-icons/fi";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { useExit } from "../ctx/useExit";

/* Craft-pattern primitives (SettingsScreen.jsx 30–104). A group is a stack
   of rows on fill-3; a row is title 13/600, a line of description at 12 and
   the control on the right. Every row is one 105 / 32 form row. */

export function SGroup({
  title,
  hint,
  children,
  menu,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  menu?: boolean;
}) {
  return (
    <section className="settings-sgroup">
      {title ? (
        <div className="base-stack">
          <span className="settings-sgroup-text">{title}</span>
          {hint ? (
            <span className="base-meta settings-sgroup-text-2">{hint}</span>
          ) : null}
        </div>
      ) : null}
      <div className={"settings-sgroup-stack" + (menu ? " has-menu" : "")}>
        {children}
      </div>
    </section>
  );
}

export function SRow({
  title,
  desc,
  children,
  tone,
  onClick,
  lead,
  expanded,
  disabled,
}: {
  title: ReactNode;
  desc?: ReactNode;
  children?: ReactNode;
  tone?: "danger" | "link";
  onClick?: () => void;
  lead?: ReactNode;
  expanded?: boolean;
  disabled?: boolean;
}) {
  const click = !!onClick && !disabled;
  return (
    <div
      onClick={click ? onClick : undefined}
      role={click ? "button" : undefined}
      tabIndex={click ? 0 : undefined}
      aria-expanded={expanded === undefined ? undefined : expanded}
      aria-disabled={disabled || undefined}
      className={
        "settings-srow-row" +
        (desc ? " has-desc" : "") +
        (click ? " is-click nx-focus" : "")
      }
      onKeyDown={
        click
          ? (e) => {
              if (
                e.target === e.currentTarget &&
                (e.key === "Enter" || e.key === " ")
              ) {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      {lead ?? null}
      <div className="base-stack settings-srow-stack">
        <span
          className={
            "settings-srow-text settings-srow-title" +
            (tone === "danger" ? " is-danger" : "")
          }
        >
          {title}
        </span>
        {desc ? <span className="settings-srow-text-2">{desc}</span> : null}
      </div>
      {children !== undefined && children !== null ? (
        <div
          className="base-row settings-srow-row-2"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A 32px pill on fill-3 that opens a menu of the options. (The prototype uses
 * a native select element; the UI contract retires it, so this is a Radix menu
 * drawn inside the `.needt-v3` scope.)
 */
export function SSelect({
  value,
  options,
  onChange,
  width,
  label,
  disabled,
}: {
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
  width?: number;
  label: string;
  /** Off until the value's source has loaded, so nothing writes blind. */
  disabled?: boolean;
}) {
  const container = useV3PortalContainer();
  const [open, setOpen] = useState(false);
  const [shown, leaving] = useExit(open, 130);
  const cur = options.find(([v]) => v === value);
  const w = width ?? 140;
  return (
    <Dropdown.Root
      open={open && !disabled}
      onOpenChange={(next) => setOpen(next && !disabled)}
      modal={false}
    >
      <span className="settings-sselect-row" style={{ width: w }}>
        <Dropdown.Trigger asChild>
          <button
            type="button"
            className="settings-sselect-select"
            aria-label={label}
            disabled={disabled}
            aria-haspopup="listbox"
            style={{
              textAlign: "left",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {cur ? cur[1] : value}
          </button>
        </Dropdown.Trigger>
        <span className="settings-sselect-layer">
          <FiChevronDown size={13} aria-hidden />
        </span>
      </span>
      {shown && container ? (
        <Dropdown.Portal container={container} forceMount>
          <Dropdown.Content
            forceMount
            align="end"
            sideOffset={6}
            collisionPadding={8}
            className={"nx-pop is-right" + (leaving ? " is-leaving" : "")}
            style={{
              zIndex: 1100,
              minWidth: Math.max(w, 160),
              maxHeight: 280,
              overflowY: "auto",
              padding: 6,
              boxSizing: "border-box",
              borderRadius: 14,
              background: "var(--surface-raised)",
              boxShadow: "var(--shadow-floating)",
              outline: "none",
              transformOrigin: "top right",
            }}
          >
            <Dropdown.RadioGroup value={value} onValueChange={onChange}>
              {options.map(([v, l]) => (
                <Dropdown.RadioItem
                  key={v}
                  value={v}
                  className="menu-row"
                  style={{ outline: "none", cursor: "default" }}
                >
                  <span style={{ display: "flex", width: 14 }}>
                    {v === value ? <FiCheck size={13} aria-hidden /> : null}
                  </span>
                  <span style={{ flex: 1, textAlign: "left" }}>{l}</span>
                </Dropdown.RadioItem>
              ))}
            </Dropdown.RadioGroup>
          </Dropdown.Content>
        </Dropdown.Portal>
      ) : null}
    </Dropdown.Root>
  );
}

export function SBtn({
  children,
  tone,
  onClick,
  disabled,
  icon,
}: {
  children: ReactNode;
  tone?: "danger";
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        tone === "danger" ? "nx-btn nx-btn-danger" : "nx-btn nx-btn-secondary"
      }
    >
      {icon}
      {children}
    </button>
  );
}

/** The design system's switch (ds-tokens.css `.nt-switch`). */
export function V3Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label
      className="nt-switch"
      data-checked={checked ? "true" : "false"}
      data-disabled={disabled ? "true" : undefined}
    >
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="nt-switch-track">
        <span className="nt-switch-knob" />
      </span>
    </label>
  );
}

/** PRO mark (paywall.jsx `ProBadge`): locked on Free, plain on Pro. */
export function ProPill({ locked }: { locked?: boolean }) {
  return (
    <span
      className={"pro-badge is-sm" + (locked ? " is-locked" : "")}
      data-pro-badge={locked ? "locked" : "on"}
      aria-label={locked ? "Pro feature — locked" : "Pro feature"}
    >
      {locked ? <FiLock size={8} aria-hidden /> : null}PRO
    </span>
  );
}

export function Kbd({ k }: { k: string }) {
  return <span className="settings-kbd-grid">{k}</span>;
}
