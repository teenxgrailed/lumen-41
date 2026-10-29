import { NextRequest, NextResponse } from "next/server";

import { newDate } from "@/lib/date-utils";
import { escapeHtml } from "@/lib/email/templates/layout";
import { logger } from "@/lib/logger";
import { enforceRateLimits, ipRule } from "@/lib/security/rate-limit";
import {
  STUDENT_SUPPORT_EMAIL,
  confirmStudentToken,
} from "@/lib/students/student-service";
import { verifyStudentToken } from "@/lib/students/token";

const LOG_SOURCE = "StudentConfirm";

/**
 * The link in a student verify or re-check mail, no login needed: the signed
 * token is the proof. GET only draws one button and changes nothing, so the
 * link scanners many universities run on incoming mail cannot confirm an
 * address on their own; the button POSTs back here and that confirms.
 */
function page(input: {
  title: string;
  body: string;
  status: number;
  token?: string;
}) {
  const form = input.token
    ? `<form method="post"><input type="hidden" name="t" value="${escapeHtml(input.token)}"><button type="submit">Confirm</button></form>`
    : "";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(input.title)}</title>
<style>
:root{color-scheme:light dark}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f3ee;color:#1b1a17;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:380px;padding:24px 20px}
h1{margin:0 0 8px;font-size:13px;font-weight:600}
p{margin:0 0 16px;color:#6a665e}
button{font:inherit;font-weight:600;padding:8px 16px;border-radius:8px;border:0;background:#1b1a17;color:#f6f3ee;cursor:pointer}
@media (prefers-color-scheme:dark){body{background:#12110f;color:#f1ede6}p{color:#a29d93}button{background:#f1ede6;color:#12110f}}
</style></head>
<body><main><h1>${escapeHtml(input.title)}</h1><p>${escapeHtml(input.body)}</p>${form}</main></body></html>`;
  return new NextResponse(html, {
    status: input.status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

const BROKEN = {
  title: "This link does not work",
  body: `It may be incomplete or older than its time limit. Add the address again in Settings, Plan, or write to ${STUDENT_SUPPORT_EMAIL}.`,
};

async function limit(request: NextRequest) {
  return enforceRateLimits(
    [ipRule(request, "student-confirm:ip", 30, 60 * 60)],
    { route: request.nextUrl.pathname }
  );
}

export async function GET(request: NextRequest) {
  const limited = await limit(request);
  if (limited) return limited;
  const token = request.nextUrl.searchParams.get("t");
  if (!verifyStudentToken(token, newDate().getTime())) {
    return page({ ...BROKEN, status: 400 });
  }
  return page({
    title: "Confirm your university email",
    body: "One tap and the student price applies to this address's Needt account.",
    status: 200,
    token: token ?? undefined,
  });
}

export async function POST(request: NextRequest) {
  const limited = await limit(request);
  if (limited) return limited;
  const form = await request.formData().catch(() => null);
  const raw = form?.get("t");
  const token = typeof raw === "string" ? raw : null;
  try {
    const outcome = await confirmStudentToken(token);
    if (outcome === "verified") {
      return page({
        title: "You're confirmed",
        body: "Your student price is on. Checkout applies it to Pro monthly and yearly; you can close this page.",
        status: 200,
      });
    }
    if (outcome === "taken") {
      return page({
        title: "This address is already in use",
        body: `It holds a student price on another account. Write to ${STUDENT_SUPPORT_EMAIL} if it is yours.`,
        status: 409,
      });
    }
    return page({ ...BROKEN, status: 400 });
  } catch (error) {
    logger.error(
      "Student confirmation failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return page({
      title: "Something went wrong",
      body: "Nothing was changed. Try the link again in a minute.",
      status: 500,
    });
  }
}
