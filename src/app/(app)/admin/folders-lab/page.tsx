import { FolderLab } from "@/components/needt3/folders-lab/FolderLab";

export const metadata = { title: "Folders lab" };

export const dynamic = "force-dynamic";

/**
 * Admin-only lab (the layout above checks): six candidate folders for the
 * project and doc folder, side by side in light and dark. Not linked from the
 * admin nav and not wired into the product. `?v=v3` shows one variant,
 * `?theme=dark` one theme.
 */
export default async function AdminFoldersLabPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; theme?: string }>;
}) {
  const { v, theme } = await searchParams;
  return (
    <FolderLab
      only={v}
      theme={theme === "light" || theme === "dark" ? theme : undefined}
    />
  );
}
