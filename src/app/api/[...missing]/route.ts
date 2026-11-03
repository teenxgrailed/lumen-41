import { NextResponse } from "next/server";

/**
 * Any /api/* address no route claims. Without this the page catch-all in
 * `(app)/[...missing]` took it and answered the HTML "Not found" page with
 * status 200. A specific route always wins over this one.
 */
function notFound() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const HEAD = notFound;
export const OPTIONS = notFound;
