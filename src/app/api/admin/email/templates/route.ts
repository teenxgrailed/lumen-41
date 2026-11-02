import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";
import { authSecret } from "@/lib/auth/auth-secret";
import { EmailService } from "@/lib/email/email-service";
import { getEmailProgramSettings } from "@/lib/email/program-settings";
import { lifecycleSamples } from "@/lib/email/templates/lifecycle-catalog";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { SUPPORT_EMAIL } from "@/lib/legal/operator";

const LOG_SOURCE = "AdminEmailTemplatesAPI";

export const runtime = "nodejs";

/** Words in the body text, for the 90-word rule of lifecycle mail. */
function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * GET /api/admin/email/templates : every email of the programme rendered with
 * sample data: subject, preheader (in the html), html, plain text and whether
 * it carries the one-click unsubscribe header.
 */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { footer } = await getEmailProgramSettings();
  const samples = lifecycleSamples(footer ?? undefined);
  return NextResponse.json({
    realFooter: Boolean(footer),
    templates: samples.map((sample) => ({
      key: sample.key,
      label: sample.label,
      kind: sample.kind,
      subject: sample.email.subject,
      html: sample.email.html,
      text: sample.email.text,
      words: wordCount(sample.email.text),
      headers:
        sample.kind === "optional"
          ? {
              "List-Unsubscribe": "present",
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              "Reply-To": SUPPORT_EMAIL,
            }
          : { "Reply-To": SUPPORT_EMAIL },
    })),
  });
}

const sendSchema = z.object({ key: z.string().min(1).max(60) });

/**
 * POST /api/admin/email/templates `{ key }` : "Send me this". One sample mail
 * to the signed-in admin's own address, `[PREVIEW]` in the subject. Its
 * unsubscribe link names no real account.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const parsed = sendSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Pick a template." }, { status: 400 });
    }
    const token = await getToken({ req: request, secret: authSecret() });
    const to = typeof token?.email === "string" ? token.email : null;
    if (!to) {
      return NextResponse.json(
        { error: "Your session has no email address." },
        { status: 409 }
      );
    }
    const { footer } = await getEmailProgramSettings();
    const sample = lifecycleSamples(footer ?? undefined).find(
      (item) => item.key === parsed.data.key
    );
    if (!sample) {
      return NextResponse.json({ error: "No such template." }, { status: 404 });
    }
    const optional = sample.kind === "optional";
    const link = unsubscribeUrl(`preview-${parsed.data.key}`, "updates");
    const result = await EmailService.sendEmail({
      to,
      subject: `[PREVIEW] ${sample.email.subject}`,
      html: sample.email.html,
      text: sample.email.text,
      replyTo: SUPPORT_EMAIL,
      ...(optional
        ? { commercial: true, programme: true, unsubscribeUrl: link }
        : {}),
    });
    if (!result.jobId) {
      return NextResponse.json(
        { error: "The preview was not sent (suppressed or sandbox address)." },
        { status: 409 }
      );
    }
    return NextResponse.json({ sentTo: to });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Preview send failed",
      LOG_SOURCE,
      "The preview could not be sent."
    );
  }
}
