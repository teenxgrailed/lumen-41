import { DsShowcase } from "@/components/needt3/ds/Showcase";

export const metadata = { title: "Design system" };

export const dynamic = "force-dynamic";

/**
 * Admin-only showcase of the design system: every shared component, every
 * variant and size, in every state, light and dark side by side. The admin
 * layout above checks `isAdmin()` once on the server and renders
 * AccessDeniedMessage for anyone else, so this page never renders for them.
 * Not linked from the admin nav; `?scope=light|dark` shows one theme,
 * `?hit=1` outlines each control's 44px hit area.
 */
export default async function AdminDsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; hit?: string }>;
}) {
  const { scope, hit } = await searchParams;
  return (
    <DsShowcase
      scope={scope === "light" || scope === "dark" ? scope : "both"}
      showHitAreas={hit === "1"}
    />
  );
}
