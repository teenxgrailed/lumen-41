/**
 * The thin platform layer (docs/port/02-task-plan.md §0): what the prototype's
 * `platform.js` gave the phone, web implementations only. The prototype's
 * runtime layers (sync, boot, lazy loading) are not ported.
 */

export type HapticKind = "light" | "medium" | "heavy";

const MS: Record<HapticKind, number> = { light: 8, medium: 14, heavy: 22 };

/**
 * A short tap under the finger where the browser allows it (Android Chrome;
 * iOS Safari has no vibration API, so this is a quiet no-op there). Never
 * throws and never fires under reduced motion.
 */
export function haptic(kind: HapticKind = "light") {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.vibrate !== "function"
  )
    return;
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;
  try {
    navigator.vibrate(MS[kind]);
  } catch {
    /* a page without user activation */
  }
}
