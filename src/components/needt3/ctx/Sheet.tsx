"use client";

import { type CSSProperties, type PropsWithChildren } from "react";

import * as Dialog from "@radix-ui/react-dialog";

import { useV3PortalContainer } from "./PortalScope";
import { useExit } from "./useExit";

export interface SheetProps extends PropsWithChildren {
  open: boolean;
  onClose: () => void;
  /** Accessible name; rendered visually hidden. */
  title: string;
  /** The scrim: `td-scrim` (keyboard sheet), `base-scrim nx-scrim` … */
  scrimClassName: string;
  /** The card: `key-sheet`, `nx-sheet …` */
  className: string;
  style?: CSSProperties;
  /** Exit duration, matching the CSS `is-leaving` animation. */
  exitMs?: number;
}

/**
 * A modal sheet on Radix Dialog, portalled into the `.needt-v3` scope.
 * The card sits inside the scrim (the scrim centres it, as in the
 * prototype), and both get `is-leaving` while the exit animation plays.
 */
export function Sheet({
  open,
  onClose,
  title,
  scrimClassName,
  className,
  style,
  exitMs = 170,
  children,
}: SheetProps) {
  const container = useV3PortalContainer();
  const [shown, leaving] = useExit(open, exitMs);
  if (!shown || !container) return null;
  const out = leaving ? " is-leaving" : "";
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal container={container} forceMount>
        <Dialog.Overlay className={scrimClassName + out} forceMount>
          <Dialog.Content
            className={className + out}
            style={style}
            forceMount
            aria-describedby={undefined}
          >
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
