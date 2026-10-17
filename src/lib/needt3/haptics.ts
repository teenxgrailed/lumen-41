/**
 * Haptics where the web has them: `navigator.vibrate` short pulses (Android
 * Chrome). iOS Safari has no web haptics - the call is absent - so there this
 * does nothing, by feature detection and not by user agent. A pulse is never
 * played for a person who asked the device for reduced motion.
 */
export type Haptic = "tick" | "success";

/** Milliseconds of each pattern; a pattern array alternates pulse and pause. */
export const HAPTIC_MS: Record<Haptic, number | number[]> = {
  /** the swipe crossing its threshold */
  tick: 8,
  /** a task completed */
  success: [10, 40, 14],
};

interface VibrateNavigator {
  vibrate?: (pattern: number | number[]) => boolean;
}

/** Returns whether a pulse was requested. */
export function haptic(
  kind: Haptic,
  nav: VibrateNavigator | undefined = typeof navigator === "undefined"
    ? undefined
    : (navigator as unknown as VibrateNavigator),
  reduced: boolean = typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
): boolean {
  if (!nav || typeof nav.vibrate !== "function" || reduced) return false;
  try {
    return nav.vibrate(HAPTIC_MS[kind]) !== false;
  } catch {
    return false;
  }
}
