import type { PropsWithChildren } from "react";

/**
 * The sky behind the auth screens: one prerendered picture (soft halftone
 * clouds at the edges, public/auth/sky-*.webp), light and night, wide and
 * tall. It is a CSS background and nothing else: no canvas, no frame loop, so
 * it paints once and there is nothing to pause for reduced motion.
 *
 * It wears `.px-sky` so the `--px-*` tokens the cards beside it read still
 * resolve.
 */
export function AuthSky({
  variant = "a",
  children,
}: PropsWithChildren<{ variant?: "a" | "b" | "c" | "d" }>) {
  return (
    <div className="px-sky auth-sky" data-auth-sky={variant}>
      {children != null ? <div className="px-content">{children}</div> : null}
    </div>
  );
}
