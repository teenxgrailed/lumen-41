/**
 * The sign-in family of pages: /auth/signin, /auth/reset-password, the
 * confirmation and desktop-handoff screens. Nothing the product says on its
 * own belongs on them, so the notice bridge and the nudge pollers ask this.
 */
export function isAuthPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/auth" || pathname.startsWith("/auth/");
}

/** The same question for code that has no router, only the window. */
export function onAuthPath(): boolean {
  if (typeof window === "undefined") return false;
  return isAuthPath(window.location.pathname);
}
