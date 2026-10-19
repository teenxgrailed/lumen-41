"use client";

import { type ReactNode, useState } from "react";

import * as Dialog from "@radix-ui/react-dialog";

import { useV3PortalContainer } from "../../ctx/PortalScope";
import { PkSheet } from "../../phone/kit";

/**
 * What the End day and weekly review sheets sit in: on the phone the sheet
 * (swipe down to close), on desktop a dialog over the screen. The content is
 * the design's own `.ha-sheet`; this only holds it.
 */
export function HaSheet({
  open,
  phone,
  label,
  onClose,
  children,
}: {
  open: boolean;
  phone?: boolean;
  /** The accessible name ("End day"). */
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const container = useV3PortalContainer();
  // The phone's sheet stays mounted only while it is open or sliding away, so
  // a closed Home carries none of its body.
  const [alive, setAlive] = useState(false);
  if (open && !alive) setAlive(true);
  if (phone) {
    if (!alive && !open) return null;
    return (
      <PkSheet
        open={open}
        onClose={onClose}
        onShut={() => setAlive(false)}
        label={label}
        bodyClass="ha-sheet-body"
      >
        <div className="ha-phone">{children}</div>
      </PkSheet>
    );
  }
  if (!open || !container) return null;
  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="tdc-scrim">
          <Dialog.Content
            className="ha-desk ha-dialog"
            aria-describedby={undefined}
          >
            <Dialog.Title className="ha-sr">{label}</Dialog.Title>
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
