"use client";

import type { CSSProperties, ReactNode } from "react";

import { LuX } from "react-icons/lu";

import { Sheet } from "../ctx/Sheet";
import { PkSheet } from "../phone/kit";
import { usePhoneUi } from "../root/phone-ui-context";

export type PopupSize = "split" | "wide" | "narrow";

export interface PopupShellProps {
  open: boolean;
  onClose: () => void;
  /** The accessible name of the dialog. */
  title: string;
  /** split: copy and an image side by side. wide: two cards. narrow: one column. */
  size: PopupSize;
  /** The picture. Desktop: the right half. Phone: a band above the copy. */
  art?: ReactNode;
  /** The buttons. Desktop: the foot of the copy column. Phone: the sheet's foot. */
  actions?: ReactNode;
  /** The `data-pp` name, for tests and shots. */
  name: string;
  children?: ReactNode;
}

/**
 * The one frame every popup wears. It wraps what the app already has and
 * forks neither: on a desktop it is `ctx/Sheet` (Radix Dialog, portalled into
 * the v3 scope, scrim and Escape included); on a phone it is the phone kit's
 * `PkSheet` (the bottom sheet that follows a finger and closes by sliding).
 * Which one is the frame's call (`usePhoneUi`), so a popup opened before a
 * window crosses 700 px keeps its content and only changes its frame.
 */
export function PopupShell({
  open,
  onClose,
  title,
  size,
  art,
  actions,
  name,
  children,
}: PopupShellProps) {
  const phone = usePhoneUi() === "phone";
  if (phone) {
    return (
      <PkSheet
        open={open}
        onClose={onClose}
        label={title}
        className="pp-phone"
        bodyClass="pp-phone-body"
        footer={actions ? <div className="pp-actions">{actions}</div> : null}
      >
        <div className="pp-pane" data-pp={name} data-pp-size={size}>
          {art ? <div className="pp-art-band">{art}</div> : null}
          {children}
        </div>
      </PkSheet>
    );
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      scrimClassName="base-scrim nx-scrim pp-scrim"
      className={"pp-card pp-" + size}
      exitMs={170}
      initialFocus="card"
    >
      <div className="pp-pane" data-pp={name} data-pp-size={size}>
        <div className="pp-copy">
          {children}
          {actions ? <div className="pp-actions">{actions}</div> : null}
        </div>
        {art ? <div className="pp-art-col">{art}</div> : null}
      </div>
      <button
        type="button"
        className="pp-x nx-press"
        aria-label="Close"
        onClick={onClose}
      >
        <LuX size={14} />
      </button>
    </Sheet>
  );
}

/** One stagger step: items arrive 55 ms apart (PORT.md section 6). */
export function rise(i: number): CSSProperties {
  return { "--i": i } as CSSProperties;
}
