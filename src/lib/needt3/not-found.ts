/**
 * Which 404 an unknown address gets (`src/app/(app)/[...missing]`): the
 * design_v3 face inside the shell, or the root `not-found` as before. API
 * paths and file-like paths always keep the root 404 (a JSON client or an
 * asset request must never get an HTML page with status 200).
 */
export function missingRouteFace(
  segments: readonly string[] | undefined,
  designV3: boolean
): "v3" | "root" {
  if (!designV3) return "root";
  const parts = segments ?? [];
  if (!parts.length || parts[0] === "api") return "root";
  const last = parts[parts.length - 1] ?? "";
  if (/\.[a-z0-9]{1,8}$/i.test(last)) return "root";
  return "v3";
}
