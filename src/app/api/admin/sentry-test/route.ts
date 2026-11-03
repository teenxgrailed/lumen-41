import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";

/**
 * Throw one uncaught server error so the owner can confirm on production that
 * Next's onRequestError hook (src/instrumentation.ts) reaches Sentry.
 *
 * Unlike POST /api/admin/sentry-check, which captures an exception by hand,
 * this leaves the error uncaught: it only shows up in Sentry when the
 * instrumentation hook is loaded and Sentry is initialised for the runtime.
 * The response is a 500 with no body of its own.
 */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  throw new Error("Sentry server test " + newDate().toISOString());
}
