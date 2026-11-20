import type { PropsWithChildren } from "react";

/**
 * The sky behind the sign-in screens, as CSS only: a gradient and a few soft
 * glows (auth-redo.css). The printed sky (PxSky) is two canvases and a rAF
 * loop; on a throttled phone that loop held sign-in at 16 FPS. This one paints
 * once and never again, so there is nothing to pause for reduced motion.
 *
 * It wears `.px-sky` so the `--px-*` tokens the glass cards read still resolve.
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
