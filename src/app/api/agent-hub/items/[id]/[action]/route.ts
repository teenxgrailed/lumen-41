import { NextRequest, NextResponse } from "next/server";

import { markItemSeen } from "@/services/agent-hub/alerts";
import { linkItems, unlinkItems } from "@/services/agent-hub/graph";
import {
  authenticateHubOwner,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import {
  cancelItem,
  getItem,
  ownerAnswer,
  ownerApprove,
  ownerApproveLarge,
  ownerReassign,
} from "@/services/agent-hub/items";
import {
  cancelInput,
  ownerAnswerInput,
  ownerApproveInput,
  ownerApproveLargeInput,
  ownerLinkInput,
  ownerReassignInput,
} from "@/services/agent-hub/schemas";

type Params = { params: Promise<{ id: string; action: string }> };

/**
 * Owner-only actions on an item: answer, approve, cancel, reassign, `seen`
 * (the owner opened it, so its alert is read), `link` / `unlink` (`{ toId,
 * kind }` with this item as the source) and `detail` for the full log. Session auth only; no bearer token of any kind
 * is an owner.
 */
export async function POST(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const { id, action } = await params;
    const auth = await authenticateHubOwner(
      request,
      action !== "detail" && action !== "seen"
    );
    if ("response" in auth) return auth.response;
    switch (action) {
      case "detail":
        return NextResponse.json(await getItem(auth.scope, id));
      case "seen":
        return NextResponse.json({
          seen: await markItemSeen(auth.scope, id),
        });
      case "answer": {
        const body = await parseJsonBody(request, ownerAnswerInput);
        if ("response" in body) return body.response;
        return NextResponse.json(
          await ownerAnswer(auth.scope, id, body.data.answer)
        );
      }
      case "approve": {
        const body = await parseJsonBody(request, ownerApproveInput);
        if ("response" in body) return body.response;
        return NextResponse.json(await ownerApprove(auth.scope, id, body.data));
      }
      case "approve-large": {
        const body = await parseJsonBody(request, ownerApproveLargeInput);
        if ("response" in body) return body.response;
        return NextResponse.json(
          await ownerApproveLarge(auth.scope, id, body.data.approved)
        );
      }
      case "cancel": {
        const body = await parseJsonBody(
          request,
          cancelInput.omit({ id: true })
        );
        if ("response" in body) return body.response;
        return NextResponse.json(
          await cancelItem(auth.scope, { ...body.data, id })
        );
      }
      case "reassign": {
        const body = await parseJsonBody(request, ownerReassignInput);
        if ("response" in body) return body.response;
        return NextResponse.json(
          await ownerReassign(auth.scope, id, body.data)
        );
      }
      case "link":
      case "unlink": {
        const body = await parseJsonBody(request, ownerLinkInput);
        if ("response" in body) return body.response;
        const input = { ...body.data, fromId: id };
        return NextResponse.json(
          action === "link"
            ? await linkItems(auth.scope, input)
            : await unlinkItems(auth.scope, input)
        );
      }
      default:
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  });
}
