import { NextRequest, NextResponse } from "next/server";

import { APP_NAME } from "@/lib/app-config";
import {
  CATEGORY_COPY,
  OPTIONAL_CATEGORIES,
  type OptionalCategory,
} from "@/lib/email/categories";
import {
  getPreferences,
  recordKeep,
  setCategory,
  setFewerEmails,
  switchOffAllOptional,
} from "@/lib/email/preferences";
import { escapeHtml } from "@/lib/email/templates/layout";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe";
import { logger } from "@/lib/logger";
import { enforceRateLimits, ipRule } from "@/lib/security/rate-limit";

const LOG_SOURCE = "EmailPreferences";

export const runtime = "nodejs";

/**
 * The email preference page, no login: the signed token in the mail is the
 * proof, the same one the unsubscribe link uses.
 *
 * - GET only draws the form (mail scanners prefetch links, so GET changes
 *   nothing).
 * - POST applies what the form says: save the categories, keep the emails
 *   ("still want these?"), or stop all optional email.
 */
async function limit(request: NextRequest) {
  return enforceRateLimits(
    [ipRule(request, "email-preferences:ip", 60, 60 * 60)],
    { route: request.nextUrl.pathname }
  );
}

function page(title: string, bodyHtml: string, status = 200) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:light dark}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f3ee;color:#1b1a17;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:400px;padding:24px 20px;width:100%;box-sizing:border-box}
h1{margin:0 0 8px;font-size:13px;font-weight:600}
p{margin:0 0 8px;color:#6a665e}
label{display:block;margin:10px 0 0;color:#1b1a17}
label small{display:block;color:#6a665e;font-size:12px;margin-left:22px}
input[type=checkbox]{margin-right:8px}
.row{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
button{font:inherit;font-weight:600;padding:8px 14px;border-radius:8px;border:0;background:#1b1a17;color:#fffdf9;cursor:pointer}
button.quiet{background:transparent;color:#1b1a17;border:1px solid #cfc9bd}
@media (prefers-color-scheme:dark){body{background:#12110f;color:#f1ede6}p,label small{color:#a29d93}label{color:#f1ede6}button{background:#f1ede6;color:#1b1a17}button.quiet{color:#f1ede6;border-color:#47433b}}
</style></head>
<body><main><h1>${escapeHtml(title)}</h1>${bodyHtml}</main></body></html>`;
  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

const broken = () =>
  page(
    "This link does not work",
    `<p>It may be incomplete. You can change which emails you get in ${escapeHtml(APP_NAME)} under Settings, Notifications.</p>`,
    400
  );

export async function GET(request: NextRequest) {
  const limited = await limit(request);
  if (limited) return limited;

  const token = request.nextUrl.searchParams.get("t");
  const claims = verifyUnsubscribeToken(token);
  if (!claims) return broken();
  const preferences = await getPreferences(claims.userId);
  if (!preferences) return broken();

  const keep = request.nextUrl.searchParams.get("keep") === "1";
  const boxes = OPTIONAL_CATEGORIES.map(
    (category) =>
      `<label><input type="checkbox" name="${category}"${
        preferences.categories[category] ? " checked" : ""
      }>${escapeHtml(CATEGORY_COPY[category].label)}<small>${escapeHtml(
        CATEGORY_COPY[category].description
      )}</small></label>`
  ).join("");
  const fewer = `<label><input type="checkbox" name="fewer"${
    preferences.fewer ? " checked" : ""
  }>Fewer emails<small>At most one a week instead of one every three days.</small></label>`;
  const keepRow = keep
    ? `<div class="row"><button type="submit" name="action" value="keep">Keep getting these emails</button></div>`
    : "";
  const body = `<p>Emails about your account and security always arrive.</p>
<form method="post" action="/api/email/preferences?t=${encodeURIComponent(token ?? "")}">
${keepRow}${boxes}${fewer}
<div class="row"><button type="submit" name="action" value="save">Save</button><button type="submit" name="action" value="stop" class="quiet">Stop all of these</button></div>
</form>`;
  return page("Your emails", body);
}

export async function POST(request: NextRequest) {
  const limited = await limit(request);
  if (limited) return limited;

  const claims = verifyUnsubscribeToken(request.nextUrl.searchParams.get("t"));
  if (!claims) return broken();
  try {
    const form = await request.formData().catch(() => null);
    const action = String(form?.get("action") ?? "save");
    if (action === "stop") {
      await switchOffAllOptional(claims.userId, "unsubscribe-link");
      return page(
        "You are unsubscribed",
        "<p>You will not get these emails any more. Emails about your account and security still arrive.</p>"
      );
    }
    if (action === "keep") {
      await recordKeep(claims.userId);
      return page("Thank you", "<p>You will keep getting our emails.</p>");
    }
    const asked = (name: string) => form?.get(name) !== null && form !== null;
    for (const category of OPTIONAL_CATEGORIES as readonly OptionalCategory[]) {
      await setCategory(claims.userId, category, asked(category), "settings");
    }
    await setFewerEmails(claims.userId, asked("fewer"));
    return page("Saved", "<p>Your choices are saved.</p>");
  } catch (error) {
    logger.error(
      "Saving email preferences failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return page(
      "Something went wrong",
      "<p>Your choices were not saved. Please try again.</p>",
      500
    );
  }
}
