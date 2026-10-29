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
 * One-click unsubscribe, no login. GET is the link in the footer; POST is the
 * RFC 8058 `List-Unsubscribe-Post: List-Unsubscribe=One-Click` request a mail
 * client sends by itself. Both read the signed token from `?t=`.
 */
async function handle(request: NextRequest) {
  const limited = await enforceRateLimits(
    [ipRule(request, "email-unsubscribe:ip", 60, 60 * 60)],
    { route: request.nextUrl.pathname }
  );
  if (limited) return { kind: "limited", response: limited } as const;

  const claims = verifyUnsubscribeToken(request.nextUrl.searchParams.get("t"));
  if (!claims) return { kind: "done", ok: false, status: 400 } as const;
  try {
    const found = await applyUnsubscribe(claims.userId, claims.category);
    if (!found) return { kind: "done", ok: false, status: 404 } as const;
    return { kind: "done", ok: true, category: claims.category } as const;
  } catch (error) {
    logger.error(
      "Unsubscribe failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return { kind: "done", ok: false, status: 500 } as const;
  }
}

function page(title: string, body: string, status: number) {
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
@media (prefers-color-scheme:dark){body{background:#12110f;color:#f1ede6}p{color:#a29d93}}
</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></main></body></html>`;
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
  const result = await handle(request);
  if (result.kind === "limited") return result.response;
  if (result.ok) {
    return page(
      "You are unsubscribed",
      UNSUBSCRIBE_CONFIRMATION[result.category],
      200
    );
  }
  return page(
    "This link does not work",
    `It may be incomplete. You can change which emails you get in ${APP_NAME} under Settings, Notifications.`,
    result.status
  );
}

export async function POST(request: NextRequest) {
  const result = await handle(request);
  if (result.kind === "limited") return result.response;
  if (result.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ ok: false }, { status: result.status });
}
