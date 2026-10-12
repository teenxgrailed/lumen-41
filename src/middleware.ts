import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { authSecret } from "@/lib/auth/auth-secret";
import { publicAppUrl } from "@/lib/public-url";

// List of public routes that don't require authentication
const publicRoutes = [
  "/setup",
  "/api/setup/check",
  "/auth/signin",
  "/auth/confirm-email",
  "/auth/reset-password",
  "/auth/error",
  "/api/auth/register",
  "/api/waitlist",
  "/beta",
  "/terms",
  "/privacy",
  "/p/",
  "/style",
  "/subscription/lifetime/success",
  "/subscription/lifetime/setup-password",
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
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static files to bypass authentication
  const hasStaticExtension = staticFileExtensions.some((ext) =>
    pathname.toLowerCase().endsWith(ext)
  );
  if (hasStaticExtension) {
    return NextResponse.next();
  }

  // Redirect /login to /auth/signin to prevent redirect loops
  if (pathname === "/login") {
    return NextResponse.redirect(publicAppUrl("/auth/signin", request));
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
    const url = publicAppUrl("/auth/signin", request);
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
      return NextResponse.redirect(publicAppUrl("/", request));
    }
  }

  // Continue with the request
  return NextResponse.next();
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
