import * as React from "react";

import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "needt-motion-control inline-flex origin-center touch-manipulation items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--control-radius)] font-medium transition-[color,background-color,border-color,transform,box-shadow] [transition-duration:var(--motion-duration-fast)] [transition-timing-function:var(--motion-ease-standard)] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--control-border)] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-[var(--button-primary-border)] bg-[var(--button-primary-bg)] text-[var(--button-primary-fg)] shadow-[var(--button-primary-shadow)] hover:bg-[var(--button-primary-bg-hover)]",
        destructive:
          "border border-[var(--button-danger-border)] bg-[var(--button-danger-bg)] text-[var(--color-danger)] hover:bg-[var(--button-danger-bg-hover)]",
        outline:
          "border border-[var(--button-secondary-border)] bg-[var(--button-secondary-bg)] text-[var(--control-fg)] hover:bg-[var(--button-secondary-bg-hover)]",
        secondary:
          "border border-[var(--button-secondary-border)] bg-[var(--button-secondary-bg)] text-[var(--control-fg)] hover:bg-[var(--button-secondary-bg-hover)]",
        ghost:
          "text-[var(--control-fg)] hover:bg-[var(--menu-item-hover)] hover:text-[var(--text-primary)]",
        link: "text-[var(--color-accent)] underline-offset-4 hover:underline",
      },
      size: {
        // Motion sizes, measured 1:1: default = settings/modal action (Save task),
        // sm = toolbar/inline action (New), lg = prominent CTA.
        default: "h-[30px] px-[7px] text-[13px] leading-[18px]",
        sm: "h-[25px] px-1.5 text-[13px] leading-[17px]",
        lg: "h-9 px-3 text-[13px] leading-[18px]",
        icon: "h-[30px] w-[30px] px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
