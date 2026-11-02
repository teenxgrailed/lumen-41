"use client";

import * as React from "react";

import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "@/lib/utils";

/**
 * Mobile bottom sheet — the house-format modal on small screens. Same Radix
 * dialog base and tokens as `@/components/ui/dialog` (shared gradient scrim,
 * no backdrop blur), but the panel is docked to the bottom edge and slides up.
 * Use for quick-create, action sheets, and any panel that is a centered dialog
 * on desktop but should be a sheet on mobile.
 */

const BottomSheet = DialogPrimitive.Root;
const BottomSheetTrigger = DialogPrimitive.Trigger;
const BottomSheetClose = DialogPrimitive.Close;
const BottomSheetPortal = DialogPrimitive.Portal;

const BottomSheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "needt-scrim dialog-overlay-anim fixed inset-0 z-50",
      className
    )}
    {...props}
  />
));
BottomSheetOverlay.displayName = "BottomSheetOverlay";

const BottomSheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <BottomSheetPortal>
    <BottomSheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "needt-overlay-depth needt-overlay-shadow bottom-sheet-anim fixed inset-x-0 bottom-0 z-50 max-h-[85vh] supports-[height:100dvh]:max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-[var(--dialog-border)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-[var(--text-primary)]",
        className
      )}
      {...props}
    >
      <div
        aria-hidden
        className="mx-auto mb-3 h-1 w-9 rounded-full bg-[var(--border-control)]"
      />
      {children}
    </DialogPrimitive.Content>
  </BottomSheetPortal>
));
BottomSheetContent.displayName = "BottomSheetContent";

const BottomSheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-base font-semibold", className)}
    {...props}
  />
));
BottomSheetTitle.displayName = "BottomSheetTitle";

const BottomSheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-[var(--text-secondary)]", className)}
    {...props}
  />
));
BottomSheetDescription.displayName = "BottomSheetDescription";

export {
  BottomSheet,
  BottomSheetTrigger,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetTitle,
  BottomSheetDescription,
};
