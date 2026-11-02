"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

import { AIChatSurface } from "./AIChatSurface";

import { fastFadeTransition, panelTransition } from "@/lib/motion";
import { useNeedtReducedMotion } from "@/components/providers/MotionRuntime";

interface AIChatOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AIChatOverlay({ open, onOpenChange }: AIChatOverlayProps) {
  const prefersReducedMotion = useNeedtReducedMotion();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="needt-scrim fixed inset-0 z-50 flex justify-end"
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
          transition={
            prefersReducedMotion ? { duration: 0 } : fastFadeTransition
          }
          onMouseDown={() => onOpenChange(false)}
        >
          <motion.aside
            className="needt-overlay-depth m-2 flex h-[calc(100vh-1rem)] supports-[height:100dvh]:h-[calc(100dvh-1rem)] w-full max-w-[420px] flex-col rounded-md border border-[var(--dialog-border)] text-[var(--text-primary)] shadow-2xl"
            initial={prefersReducedMotion ? false : { x: 16, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 1 } : { x: 12, opacity: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : panelTransition}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex h-11 items-center justify-between border-b border-[var(--border-subtle)] px-3">
              <div>
                <div className="text-sm font-medium">AI Chat</div>
                <div className="text-[11px] text-[var(--text-secondary)]">
                  Compact assistant
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="grid h-8 w-8 place-items-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                title="Close AI chat"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </header>
            <div className="min-h-0 flex-1">
              <AIChatSurface compact />
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
