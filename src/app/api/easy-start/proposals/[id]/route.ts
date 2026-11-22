import { NextRequest, NextResponse } from "next/server";

import { applyProposal, dismissProposal } from "@/services/easy-start/service";
import { authenticateAgentRequest, opErrorResponse } from "@/services/ops/http";
import { z } from "zod";

const LOG_SOURCE = "easy-start-proposal";

const bodySchema = z.object({ action: z.enum(["apply", "dismiss"]) }).strict();

/**
 * Apply or dismiss one proposal. Apply runs the same `task.simplify` as
 * "auto" mode, so the result carries an `actionId` and can be undone with
 * `POST /api/agent/actions/:id/undo`. 200 on success; 409 when the task
 * changed since the proposal was made (it is then dropped) or the feature is
 * off; 404 when there is no pending proposal of that id.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authenticateAgentRequest(request, LOG_SOURCE, {
    write: true,
  });
  if (auth.response) return auth.response;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: "Send { action: 'apply' | 'dismiss' }" },
      { status: 400 }
    );
  }
  try {
    if (body.data.action === "dismiss") {
      const dismissed = await dismissProposal(id, auth.userId);
      return dismissed
        ? NextResponse.json({ status: "dismissed" })
        : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const result = await applyProposal(id, auth.userId);
    const status =
      result.status === "applied"
        ? 200
        : result.status === "not_found"
          ? 404
          : result.status === "failed"
            ? 422
            : 409;
    return NextResponse.json(result, { status });
  } catch (error) {
    return opErrorResponse(error, LOG_SOURCE);
  }
}
