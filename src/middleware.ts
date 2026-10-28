import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { authSecret } from "@/lib/auth/auth-secret";
import { mcpHost } from "@/lib/mcp-config";
import { appRedirectUrl } from "@/lib/public-url";
import {
  isSandboxBlockedPage,
  sandboxApiCapability,
  sandboxLockedBody,
} from "@/lib/sandbox/policy";
import { contentSecurityPolicy } from "@/lib/security/csp";
import { isBogusActionId } from "@/lib/stale-deployment";

const CSP_REPORT_ONLY = contentSecurityPolicy({
  collaborationUrl: process.env.NEXT_PUBLIC_COLLABORATION_URL,
  development: process.env.NODE_ENV === "development",
});

// List of public routes that don't require authentication
const publicRoutes = [
  "/.well-known/",
  // OAuth endpoints answer clients, not browsers with a session; the
  // consent page sends a signed-out person to sign-in itself.
  "/oauth/",
  "/setup",
  "/api/setup/check",
  "/auth/signin",
  "/auth/confirm-email",
  // Opened by the desktop app with a one-time code in the fragment; the page
  // trades it for a session, so it cannot require one. (/auth/desktop, the
  // confirmation page, is not public: a stranger signs in first.)
  "/auth/desktop-complete",
  "/auth/reset-password",
  "/auth/error",
  "/api/auth/register",
  // Onboarding: the screens before the account, and the planner they call.
  "/start",
  "/api/onboarding/plan",
  "/api/waitlist",
  // Public seat counter for the landing page; read-only, cached, CORS-limited.
  "/api/lifetime-seats",
  "/beta",
  "/terms",
  "/privacy",
  "/subprocessors",
  "/p/",
  "/b/",
  "/style",
  "/subscription/lifetime/success",
  "/subscription/lifetime/setup-password",
  "/robots.txt",
];

// Routes that only admins can access
const adminRoutes = ["/admin", "/logs", "/settings/system"];

// Static file extensions that should bypass authentication
const staticFileExtensions = [
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".webp",
  ".avif",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".webmanifest",
];

function isPublicRoute(pathname: string): boolean {
  return (
    publicRoutes.some((route) => pathname.startsWith(route)) ||
    pathname === "/book" ||
    pathname.startsWith("/book/")
  );
}

/**
 * Middleware for handling authentication and authorization
 */
function firstHost(value: string | null): string | null {
  return value?.split(",")[0].trim().toLowerCase() || null;
}

/**
 * Whether a request is addressed to the MCP host. Either header naming it is
 * enough: a client-supplied X-Forwarded-Host must never pull app pages or
 * cookies onto mcp.needt.app (it can only make a request *more* restricted).
 */
function isMcpHostRequest(request: NextRequest): boolean {
  const host = mcpHost();
  return (
    firstHost(request.headers.get("host") ?? request.nextUrl.host) === host ||
    firstHost(request.headers.get("x-forwarded-host")) === host
  );
}

const MCP_METADATA_PATHS = new Set([
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/mcp",
]);

/**
 * `mcp.needt.app` serves the MCP endpoint and its metadata and nothing else:
 * no app pages, no session cookies, no sign-in redirects.
 */
function mcpHostResponse(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/mcp") {
    return NextResponse.rewrite(new URL(`/api/mcp${search}`, request.url));
  }
  if (MCP_METADATA_PATHS.has(pathname)) return NextResponse.next();
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (isMcpHostRequest(request)) {
    return mcpHostResponse(request);
  }

  // Allow static files to bypass authentication
  const hasStaticExtension = staticFileExtensions.some((ext) =>
    pathname.toLowerCase().endsWith(ext)
  );
  if (hasStaticExtension) {
    return NextResponse.next();
  }

  // Sandbox accounts (docs/sandbox-accounts.md): the session token carries
  // the kind from sign-in, so a locked route is refused before it runs. Only
  // a request that matches the route table pays for the token read.
  if (pathname.startsWith("/api/")) {
    const capability = sandboxApiCapability(pathname, request.method);
    if (capability) {
      const token = await getToken({ req: request, secret: authSecret() });
      if (token?.sandboxKind) {
        return NextResponse.json(sandboxLockedBody(capability), {
          status: 403,
        });
      }
    }
  }

  // Redirect /login to /auth/signin to prevent redirect loops
  if (pathname === "/login") {
    return NextResponse.redirect(appRedirectUrl("/auth/signin", request));
  }

  // Special handling for the setup page to prevent loops with auth
  if (pathname === "/setup") {
    // Check if the route is public (which it is)
    const response = NextResponse.next();
    // Add a header to track that this was a redirect from setup
    response.headers.set("x-redirect-from", "/setup");
    return response;
  }

  // Special handling to prevent redirect loops between /auth/signin and /setup
  if (pathname === "/auth/signin") {
    // Check for redirects from setup in the referer header
    const referer = request.headers.get("referer") || "";
    if (referer.includes("/setup")) {
      // This is a potential redirect loop - just show the signin page
      return NextResponse.next();
    }
  }

  // The root server page owns the auth-aware Calendar / Sign In redirect.
  // Keeping that decision in-process avoids a fragile middleware request back
  // into this same container (which fails behind some reverse proxies).
  if (pathname === "/") {
    return NextResponse.next();
  }

  // Check if the route is public
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Check if the route is an API route (we'll handle auth in the API routes themselves)
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Get the token from the request
  const token = await getToken({
    req: request,
    secret: authSecret(),
  });

  // If there's no token, redirect to the sign-in page
  if (!token) {
    const url = appRedirectUrl("/auth/signin", request);
    url.searchParams.set(
      "callbackUrl",
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    );
    return NextResponse.redirect(url);
  }

  // Check if the route is admin-only
  if (adminRoutes.some((route) => pathname.startsWith(route))) {
    // If the user is not an admin, redirect to the home page
    if (token.role !== "admin") {
      return NextResponse.redirect(appRedirectUrl("/", request));
    }
  }
  if (token.sandboxKind && isSandboxBlockedPage(pathname)) {
    return NextResponse.redirect(appRedirectUrl("/", request));
  }

  // Continue with the request
  return NextResponse.next();
}

/**
 * The app host is never indexed. The header is also set in next.config.js, but
 * production responses were observed without it, so every response (redirects
 * and rewrites included) gets it here as well.
 */
export async function middleware(request: NextRequest) {
  // Nothing of ours sends a build SHA as a server action id; refuse it here
  // instead of letting Next log "Failed to find Server Action" for it.
  if (isBogusActionId(request.headers.get("next-action"))) {
    return new NextResponse(null, { status: 400 });
  }
  const response = await handle(request);
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  // Report-only: browsers report violations to /api/csp-report and block
  // nothing. API responses are not documents, so they go without it.
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    response.headers.set(
      "Content-Security-Policy-Report-Only",
      CSP_REPORT_ONLY
    );
  }
  return response;
}

// Only run middleware on specific paths
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public directory)
     */
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};
