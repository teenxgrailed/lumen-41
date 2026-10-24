import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { cspReports } from "@/lib/security/csp-report";
import { enforceRateLimits, ipRule } from "@/lib/security/rate-limit";

const LOG_SOURCE = "CspReportAPI";

/** A browser sends one small JSON document per violation, or a few batched. */
const MAX_BODY_BYTES = 16_384;
const MAX_REPORTS = 10;

/**
 * POST /api/csp-report — the `report-uri` of the report-only policy
 * (src/lib/security/csp.ts). Public by necessity: browsers send reports
 * without credentials. It stores nothing but a log line per violation,
 * reduced to origins and masked paths so tokens in URLs never reach the logs,
 * and it is rate limited per IP.
 *
 * Accepts both shapes browsers send: `application/csp-report`
 * (`{"csp-report": {...}}`, kebab-case) and `application/reports+json`
 * (`[{ type: "csp-violation", body: {...} }]`, camelCase).
 */
export async function POST(request: NextRequest) {
  const limited = await enforceRateLimits(
    [ipRule(request, "csp-report:ip", 30, 60)],
    { route: request.nextUrl.pathname }
  );
  if (limited) return limited;

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }
  const text = await request.text().catch(() => "");
  if (!text || text.length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: text ? 413 : 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  for (const report of cspReports(parsed).slice(0, MAX_REPORTS)) {
    await logger.warn("CSP violation (report-only)", report, LOG_SOURCE);
  }
  return new NextResponse(null, { status: 204 });
}
