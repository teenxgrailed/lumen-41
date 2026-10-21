import { DesktopQuickAdd } from "@/components/needt3/desktop/DesktopQuickAdd";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Quick add",
  robots: { index: false, follow: false },
};

/**
 * The page behind the desktop app's quick-add window (apps/desktop opens it on
 * the global shortcut). It sits outside the app frame on purpose: the window
 * is one rounded card. It needs a session like every other page, and a stranger
 * is sent to sign in by the middleware.
 */
export default function DesktopQuickAddPage() {
  return <DesktopQuickAdd />;
}
