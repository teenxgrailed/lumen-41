/**
 * Walks every route handler under src/app/api and fails when one does not
 * authenticate and is not on the public allowlist below.
 *
 * The check is per exported handler (GET, POST, ...), not per file, so a route
 * that guards its GET and forgets its POST is caught. A handler counts as
 * authenticated when its body calls one of the auth helpers in AUTH_CALL.
 *
 * Adding a route to PUBLIC_ROUTES is a security decision: say why next to it.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, sep } from "path";

const API_ROOT = join(__dirname, "..", "app", "api");

/** Helpers that reject an unauthenticated request. */
const AUTH_CALL =
  /\b(authenticateRequest|authenticateAccountRequest|authenticateAgentRequest|authenticateConnectorRequest|authenticateConnectorToken|authenticateBearer|requireAuth|requireAdmin|requireCronSecret|getServerSession|getToken)\s*\(/;

const HANDLER =
  /^export\s+(?:(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b|const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b)/gm;

/** File-local functions: `function name(` or `const name = ` at column 0. */
const LOCAL_FUNCTION =
  /^(?:async\s+)?function\s+(\w+)|^const\s+(\w+)\s*=\s*(?:async\s*)?[(\w]/gm;

/**
 * Routes that are public on purpose. Key: path relative to src/app/api,
 * value: why it is safe without a session.
 */
const PUBLIC_ROUTES: Record<string, string> = {
  "health/route.ts": "liveness probe, returns no data",
  "setup/route.ts":
    "first-run admin creation; refuses once any user exists (see route)",
  "setup/check/route.ts": "first-run probe, returns a boolean",
  "settings/homepage-disabled/route.ts": "returns one public boolean",
  "waitlist/route.ts": "public signup form, rate limited",
  "auth/[...nextauth]/route.ts": "NextAuth handler, rate limited",
  "auth/register/route.ts": "signup, rate limited",
  "auth/public-signup/route.ts": "signup availability probe",
  "auth/reset-password/request/route.ts": "rate limited, no account oracle",
  "auth/reset-password/reset/route.ts": "single-use token, rate limited",
  "auth/email-verification/confirm/route.ts": "single-use token",
  "account/export/download/route.ts": "single-use hashed token, expires",
  "billing/webhook/route.ts": "Creem webhook, signature verified by SDK",
  "webhooks/google/route.ts": "Google channel id, resource id and token match",
  "webhooks/outlook/route.ts": "Outlook subscription id and clientState match",
  "public/booking/[slug]/route.ts": "public booking page, rate limited",
  "public/booking/[slug]/slots/route.ts": "public booking page, rate limited",
  "public/booking/cancel/[token]/route.ts": "capability token, rate limited",
  "public/pages/[token]/route.ts": "published page, capability token",
  "public/pages/[token]/events/route.ts": "published page, capability token",
  "public/pages/[token]/assets/[assetId]/route.ts":
    "published page asset, capability token",
  "public/moodboards/[id]/[token]/route.ts": "shared moodboard, token",
  "public/moodboards/[id]/[token]/assets/[assetId]/route.ts":
    "shared moodboard asset, token",
  "calendar/outlook/sync/route.ts GET": "answers 405, reads nothing",
  "mcp/route.ts GET": "answers 405, reads nothing",
  "mcp/route.ts DELETE": "answers 405, reads nothing",
  "boards/route.ts": "legacy stub that answers 410 and touches no data",
  "boards/[id]/route.ts": "legacy stub that answers 410",
  "boards/[id]/cards/route.ts": "legacy stub that answers 410",
  "boards/[id]/columns/route.ts": "legacy stub that answers 410",
  "boards/[id]/columns/[columnId]/route.ts": "legacy stub that answers 410",
};

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "__tests__") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (name === "route.ts" || name === "route.tsx") out.push(full);
  }
  return out;
}

function handlers(source: string): { method: string; body: string }[] {
  const found = [...source.matchAll(HANDLER)];
  return found.map((match, index) => ({
    method: (match[1] ?? match[2]) as string,
    body: source.slice(
      match.index,
      index + 1 < found.length ? found[index + 1].index : source.length
    ),
  }));
}

/** Names of file-local helpers whose own body authenticates. */
function authenticatingHelpers(source: string): string[] {
  const starts = [...source.matchAll(LOCAL_FUNCTION)];
  const exported = [...source.matchAll(HANDLER)].map((m) => m.index);
  const boundaries = [...starts.map((m) => m.index), ...exported].sort(
    (a, b) => a - b
  );
  return starts
    .filter((match) => {
      const next = boundaries.find((at) => at > match.index) ?? source.length;
      return AUTH_CALL.test(source.slice(match.index, next));
    })
    .map((match) => (match[1] ?? match[2]) as string);
}

/** True when the handler authenticates itself or via an authenticating helper. */
function authenticates(body: string, helpers: string[]): boolean {
  return (
    AUTH_CALL.test(body) ||
    helpers.some((name) => new RegExp(`\\b${name}\\b`).test(body))
  );
}

describe("API route authentication coverage", () => {
  const files = routeFiles(API_ROOT).map((file) => ({
    key: relative(API_ROOT, file).split(sep).join("/"),
    source: readFileSync(file, "utf8"),
  }));

  it("finds the route tree", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("authenticates every handler that is not allowlisted as public", () => {
    const unauthenticated: string[] = [];
    for (const { key, source } of files) {
      if (key in PUBLIC_ROUTES) continue;
      const helpers = authenticatingHelpers(source);
      const list = handlers(source);
      if (list.length === 0) {
        unauthenticated.push(`${key} (no exported handler found)`);
        continue;
      }
      for (const { method, body } of list) {
        if (`${key} ${method}` in PUBLIC_ROUTES) continue;
        if (!authenticates(body, helpers)) {
          unauthenticated.push(`${key} ${method}`);
        }
      }
    }
    expect(unauthenticated).toEqual([]);
  });

  it("keeps the public allowlist free of stale entries", () => {
    const present = new Set(files.map((file) => file.key));
    const stale = Object.keys(PUBLIC_ROUTES).filter(
      (key) => !present.has(key.split(" ")[0])
    );
    expect(stale).toEqual([]);
  });

  it("does not leave a fully authenticated route on the public allowlist", () => {
    const guarded = files
      .filter(({ key }) => key in PUBLIC_ROUTES)
      .filter(({ source }) => {
        const helpers = authenticatingHelpers(source);
        const list = handlers(source);
        return (
          list.length > 0 &&
          list.every(({ body }) => authenticates(body, helpers))
        );
      })
      .map(({ key }) => key);
    expect(guarded).toEqual([]);
  });
});
