/**
 * Reduces CSP violation reports to what is worth a log line: directive,
 * origins and masked paths. Query strings, fragments and token-like path
 * segments never survive, so a report cannot carry a capability into the logs.
 */

type Raw = Record<string, unknown>;

export interface CspReportSummary {
  [key: string]: string | number | null;
  directive: string | null;
  blocked: string | null;
  document: string | null;
  source: string | null;
  line: number | null;
  column: number | null;
  disposition: string | null;
}

/** Normalises either report shape to the fields worth logging. */
export function cspReports(payload: unknown): CspReportSummary[] {
  const bodies: Raw[] = [];
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (isRecord(entry) && entry.type === "csp-violation") {
        if (isRecord(entry.body)) bodies.push(entry.body);
      }
    }
  } else if (isRecord(payload) && isRecord(payload["csp-report"])) {
    bodies.push(payload["csp-report"]);
  }
  return bodies.map((body) => ({
    directive: keyword(
      field(body, "effectiveDirective", "effective-directive") ??
        field(body, "violatedDirective", "violated-directive")
    ),
    blocked: blockedSummary(field(body, "blockedURL", "blocked-uri")),
    document: urlSummary(field(body, "documentURL", "document-uri")),
    source: urlSummary(field(body, "sourceFile", "source-file")),
    line: count(field(body, "lineNumber", "line-number")),
    column: count(field(body, "columnNumber", "column-number")),
    disposition: keyword(field(body, "disposition", "disposition")),
  }));
}

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(body: Raw, camel: string, kebab: string): unknown {
  return body[camel] ?? body[kebab];
}

function keyword(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 64);
  return /^[\w' :-]+$/.test(trimmed) ? trimmed : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

/**
 * Path segments that look like ids or tokens (published-page tokens, cuids)
 * are replaced, so a log line never carries a capability.
 */
function maskPath(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) =>
      segment.length > 20 || /\d/.test(segment) ? ":id" : segment
    )
    .join("/")
    .slice(0, 200);
}

function parseUrl(value: unknown): URL | null {
  if (typeof value !== "string" || !/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return null;
  }
  try {
    return new URL(value.slice(0, 2_048));
  } catch {
    return null;
  }
}

/** Origin and masked path of a page or script; no query or fragment. */
function urlSummary(value: unknown): string | null {
  const url = parseUrl(value);
  if (!url) return keyword(value);
  if (!["http:", "https:"].includes(url.protocol)) return url.protocol;
  return `${url.origin}${maskPath(url.pathname)}`;
}

/** What was blocked: an origin, a scheme (data:, blob:) or a keyword. */
function blockedSummary(value: unknown): string | null {
  const url = parseUrl(value);
  if (!url) return keyword(value);
  return ["http:", "https:", "ws:", "wss:"].includes(url.protocol)
    ? url.origin
    : url.protocol;
}
