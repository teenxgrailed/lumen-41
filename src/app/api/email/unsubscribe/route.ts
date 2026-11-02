import { NextRequest, NextResponse } from "next/server";

import { APP_NAME } from "@/lib/app-config";
import { escapeHtml } from "@/lib/email/templates/layout";
import {
  UNSUBSCRIBE_CONFIRMATION,
  applyUnsubscribe,
  verifyUnsubscribeToken,
} from "@/lib/email/unsubscribe";
import { logger } from "@/lib/logger";
import { enforceRateLimits, ipRule } from "@/lib/security/rate-limit";

const LOG_SOURCE = "EmailUnsubscribe";

/**
 * One-click unsubscribe, no login. The token is read from `?t=`.
 *
 * - POST is the RFC 8058 `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
 *   request a mailbox provider sends by itself. It unsubscribes at once and
 *   answers a blank 200: no confirmation page, no redirect.
 * - GET is the footer link. Mail scanners prefetch links with GET, so it must
 *   not change anything: it shows a page with a button that POSTs.
 */
async function limit(request: NextRequest) {
  return enforceRateLimits(
    [ipRule(request, "email-unsubscribe:ip", 60, 60 * 60)],
    { route: request.nextUrl.pathname }
  );
}

async function apply(request: NextRequest) {
  const claims = verifyUnsubscribeToken(request.nextUrl.searchParams.get("t"));
  if (!claims) return { ok: false, status: 400 } as const;
  try {
    const found = await applyUnsubscribe(claims.userId, claims.category);
    if (!found) return { ok: false, status: 404 } as const;
    return { ok: true, category: claims.category } as const;
  } catch (error) {
    logger.error(
      "Unsubscribe failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return { ok: false, status: 500 } as const;
  }
}

function page(title: string, body: string, status: number, extraHtml = "") {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:light dark}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f3ee;color:#1b1a17;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:380px;padding:24px 20px}
h1{margin:0 0 8px;font-size:13px;font-weight:600}
p{margin:0;color:#6a665e}
form{margin:16px 0 0}
button{font:inherit;font-weight:600;padding:8px 14px;border-radius:8px;border:0;background:#1b1a17;color:#fffdf9;cursor:pointer}
@media (prefers-color-scheme:dark){body{background:#12110f;color:#f1ede6}p{color:#a29d93}button{background:#f1ede6;color:#1b1a17}}
</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p>${extraHtml}</main></body></html>`;
  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(request: NextRequest) {
  const limited = await limit(request);
  if (limited) return limited;

  const token = request.nextUrl.searchParams.get("t");
  const claims = verifyUnsubscribeToken(token);
  if (!claims) {
    return page(
      "This link does not work",
      `It may be incomplete. You can change which emails you get in ${APP_NAME} under Settings, Notifications.`,
      400
    );
  }
  /* Nothing changes on GET. The button posts to the same URL with the field a
     mailbox provider would send, so one handler serves both. */
  const action = `/api/email/unsubscribe?t=${encodeURIComponent(token ?? "")}`;
  const form = `<form method="post" action="${escapeHtml(action)}"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit">Unsubscribe</button></form>`;
  return page(
    "Unsubscribe from these emails?",
    claims.category === "digest"
      ? "This turns the daily digest off."
      : "This stops trial reminders and other product emails. Emails about your account and security still arrive.",
    200,
    form
  );
}

export async function POST(request: NextRequest) {
  const limited = await limit(request);
  if (limited) return limited;

  const result = await apply(request);
  const wantsPage = (request.headers.get("accept") ?? "").includes("text/html");
  if (result.ok) {
    if (wantsPage) {
      return page(
        "You are unsubscribed",
        UNSUBSCRIBE_CONFIRMATION[result.category],
        200
      );
    }
    return new NextResponse(null, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (wantsPage) {
    return page(
      "This link does not work",
      `It may be incomplete. You can change which emails you get in ${APP_NAME} under Settings, Notifications.`,
      result.status
    );
  }
  return new NextResponse(null, { status: result.status });
}
