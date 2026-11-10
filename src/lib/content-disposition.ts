/**
 * Builds a Content-Disposition header value that survives any file name.
 * Header values must be Latin-1, so the plain `filename` is an ASCII fallback
 * and the real name travels in an RFC 5987 `filename*` parameter.
 */
export function contentDisposition(
  disposition: "inline" | "attachment",
  name: string
): string {
  const clean = name.replace(/[\u0000-\u001f\u007f"\\]/g, "_");
  const fallback = clean.replace(/[^\x20-\x7e]/g, "_") || "file";
  const encoded = encodeURIComponent(clean).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
