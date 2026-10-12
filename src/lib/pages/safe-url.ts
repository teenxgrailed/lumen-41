/**
 * One gate for every address a page stores or draws: link marks, link /
 * bookmark / file / image blocks, page mentions and covers. Imported content
 * is untrusted, so an address is only used when it is
 *
 *   - an absolute http:, https: or mailto: URL (no credentials), or
 *   - an app-relative path under /pages or /api/pages (callers that draw task
 *     and project references widen the list with `paths`).
 *
 * Everything else (javascript:, data:, vbscript:, file:, protocol-relative
 * `//host`, backslash tricks, any whitespace or control character inside the
 * value) is refused. The check parses with `new URL` and compares the
 * protocol; nothing is matched against a pattern built from the input.
 *
 * Pure and dependency free: it runs in the browser, the server and the worker.
 */

const DUMMY_BASE = "https://needt.invalid";
const WEB_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);
/** Characters that never belong in a stored address. */
const FORBIDDEN_CHARS = new Set(['"', "<", ">", "`", "\\"]);
/** Zero-width and invisible characters that survive String.trim(). */
const INVISIBLE = new Set([
  0x00ad, 0x061c, 0x180e, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2060,
  0x2061, 0x2062, 0x2063, 0x2064, 0xfeff,
]);

export const APP_PATHS: readonly string[] = ["/pages", "/api/pages"];

export interface SafeUrlOptions {
  /** Accept mailto: (default true). Images turn it off. */
  allowMailto?: boolean;
  /** App-relative roots that are accepted (default `APP_PATHS`). */
  paths?: readonly string[];
}

function hasForbiddenChar(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) as number;
    if (code <= 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
    if (code === 0x2028 || code === 0x2029 || code === 0x00a0) return true;
    if (INVISIBLE.has(code) || FORBIDDEN_CHARS.has(ch)) return true;
    // Unicode spaces (U+1680, U+2000..200A, U+202F, U+205F, U+3000).
    if (code > 0xff && ch.trim() === "") return true;
  }
  return false;
}

/**
 * The address when it is safe to store and draw, else null. The value comes
 * back trimmed and otherwise unchanged.
 */
export function safeUrl(
  value: unknown,
  options: SafeUrlOptions = {}
): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > 8192) return null;
  if (hasForbiddenChar(candidate)) return null;
  const paths = options.paths ?? APP_PATHS;

  if (candidate.startsWith("/")) {
    // "//host" is protocol-relative; the parser would send it off-site.
    if (candidate.startsWith("//")) return null;
    let parsed: URL;
    try {
      parsed = new URL(candidate, DUMMY_BASE);
    } catch {
      return null;
    }
    if (parsed.origin !== DUMMY_BASE) return null;
    const allowed = paths.some(
      (root) =>
        parsed.pathname === root || parsed.pathname.startsWith(`${root}/`)
    );
    return allowed ? candidate : null;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (WEB_PROTOCOLS.has(parsed.protocol)) {
    if (!parsed.hostname || parsed.username || parsed.password) return null;
    return candidate;
  }
  if (parsed.protocol === "mailto:" && options.allowMailto !== false) {
    return parsed.pathname ? candidate : null;
  }
  return null;
}

export function isSafeUrl(value: unknown, options?: SafeUrlOptions): boolean {
  return safeUrl(value, options) !== null;
}
