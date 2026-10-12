/**
 * Notion ids come dashed (API) or bare (URLs, markdown). Everything inside
 * the importer uses the dashed lower-case form.
 */

const HEX32 = /([0-9a-f]{32})(?![0-9a-f])/i;

export function normalizeNotionId(raw: string): string | null {
  const bare = raw.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(bare)) return null;
  return `${bare.slice(0, 8)}-${bare.slice(8, 12)}-${bare.slice(12, 16)}-${bare.slice(16, 20)}-${bare.slice(20)}`;
}

/** The page id a Notion URL points at (the id at the end of its path). */
export function pageIdFromNotionUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    const fromPath = HEX32.exec(
      url.pathname.split("/").filter(Boolean).slice(-1)[0] ?? ""
    );
    if (fromPath) return normalizeNotionId(fromPath[1]);
    const peek = url.searchParams.get("p");
    return peek ? normalizeNotionId(peek) : null;
  } catch {
    return normalizeNotionId(raw);
  }
}

/** The block id in the fragment of a Notion block URL (`…/abc#def`). */
export function blockIdFromNotionUrl(raw: string): string | null {
  try {
    const fragment = new URL(raw).hash.replace(/^#/, "");
    return fragment ? normalizeNotionId(fragment) : null;
  } catch {
    return null;
  }
}
