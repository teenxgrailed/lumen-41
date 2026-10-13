"use client";

import * as React from "react";

import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    /** Where the content is mounted; the body when omitted (the v3 scope passes its layer). */
    container?: HTMLElement | null;
  }
>(
  (
    { className, align = "center", sideOffset = 4, container, ...props },
    ref
  ) => (
    <PopoverPrimitive.Portal container={container ?? undefined}>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "needt-overlay-depth needt-overlay-shadow needt-motion-popover z-50 w-72 rounded-[var(--popover-radius)] border border-[var(--popover-border)] p-4 text-[var(--text-primary)] outline-none",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
