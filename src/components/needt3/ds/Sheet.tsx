"use client";

import type { ReactElement, ReactNode } from "react";

import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { PkSheet } from "../phone/kit";
import { cx } from "./state";

export type SheetVariant = "bottom" | "dialog" | "anchored";
export type SheetSize = "md" | "lg";

interface PanelParts {
  title?: ReactNode;
  meta?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}

export interface SheetPanelProps extends PanelParts {
  variant?: SheetVariant;
  /** Width preset of a dialog (360 or 520); a bottom sheet takes the screen. */
  size?: SheetSize;
  className?: string;
}

function Parts({
  title,
  meta,
  footer,
  children,
  titleElement,
}: PanelParts & { titleElement?: ReactElement }) {
  return (
    <>
      {title || meta ? (
        <header className="ds-sheet-head">
          {titleElement ?? <h2 className="ds-sheet-title">{title}</h2>}
          {meta ? <span className="ds-row-meta">{meta}</span> : null}
        </header>
      ) : null}
      <div className="ds-sheet-body">{children}</div>
      {footer ? <footer className="ds-sheet-foot">{footer}</footer> : null}
    </>
  );
}

/**
 * The panel the dialog and the popover are drawn on, with no behaviour: the
 * floating material, the sheet radius, a title (28 on a sheet), a body and a
 * footer. It is also what /admin/ds shows, so the chrome has a baseline
 * without a portal. A lifted Surface inside it is flat (one raised level).
 */
export function SheetPanel({
  variant = "dialog",
  size = "md",
  className,
  ...parts
}: SheetPanelProps) {
  return (
    <div
      className={cx("ds-sheet-panel", className)}
      data-variant={variant}
      data-size={size}
      data-ds-lift=""
    >
      <Parts {...parts} />
    </div>
  );
}

export interface SheetProps extends PanelParts {
  open: boolean;
  onClose: () => void;
  /**
   * bottom: the phone sheet (PkSheet, swipe down to close). dialog: a modal
   * over the screen. anchored: a popover or a menu, next to `anchor`.
   */
  variant?: SheetVariant;
  size?: SheetSize;
  /** The accessible name when there is no visible title. */
  label?: string;
  /** The element an `anchored` sheet opens next to (required for it). */
  anchor?: ReactElement;
  /** `bottom` only: fractions of the screen height the sheet rests at. */
  detents?: readonly number[];
  /** `bottom` only: the sheet holds a text field and rises with the keyboard. */
  keyboard?: boolean;
  className?: string;
}

/**
 * The one sheet, dialog, popover and menu. `bottom` wraps the phone kit's
 * PkSheet (gestures, detents, scrim, focus trap: not forked, only given the
 * system's title); `dialog` and `anchored` are a Radix Dialog and Popover
 * portaled into the v3 scope, so they wear the person's theme.
 */
export function Sheet({
  open,
  onClose,
  variant = "bottom",
  size = "md",
  label,
  anchor,
  detents,
  keyboard,
  className,
  title,
  meta,
  footer,
  children,
}: SheetProps) {
  const container = useV3PortalContainer();

  if (variant === "bottom")
    return (
      <PkSheet
        open={open}
        onClose={onClose}
        title={title}
        meta={meta}
        footer={footer}
        label={label}
        detents={detents}
        keyboard={keyboard}
        className={cx("ds-sheet", className)}
      >
        {children}
      </PkSheet>
    );

  if (!container) return null;

  if (variant === "dialog")
    return (
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <Dialog.Portal container={container}>
          <Dialog.Overlay className="ds-scrim">
            <Dialog.Content
              className={cx("ds-sheet-panel", className)}
              data-variant="dialog"
              data-size={size}
              data-ds-lift=""
              aria-describedby={undefined}
            >
              {!title ? (
                <Dialog.Title className="ds-sr">{label}</Dialog.Title>
              ) : null}
              <Parts
                title={title}
                meta={meta}
                footer={footer}
                titleElement={
                  title ? (
                    <Dialog.Title className="ds-sheet-title">
                      {title}
                    </Dialog.Title>
                  ) : undefined
                }
              >
                {children}
              </Parts>
            </Dialog.Content>
          </Dialog.Overlay>
        </Dialog.Portal>
      </Dialog.Root>
    );

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {anchor ? <Popover.Anchor asChild>{anchor}</Popover.Anchor> : null}
      <Popover.Portal container={container}>
        <Popover.Content
          className={cx("ds-sheet-panel", className)}
          data-variant="anchored"
          data-size={size}
          data-ds-lift=""
          sideOffset={8}
          collisionPadding={12}
          aria-label={typeof title === "string" ? undefined : label}
        >
          <Parts title={title} meta={meta} footer={footer}>
            {children}
          </Parts>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
