import { NextRequest, NextResponse } from "next/server";

import {
  authenticateBearer,
  hasScopes,
  insufficientScopeResponse,
} from "@/services/connectors/bearer";
import {
  MCP_ADMIN_LIMIT_PER_MINUTE,
  adminCallAllowed,
} from "@/services/connectors/mcp/admin-tools";
import {
  batchRejectedResponse,
  handleMcpMessage,
  parseErrorResponse,
  toolCallOf,
} from "@/services/connectors/mcp/server";
import { isWriteCall, requiredScopes } from "@/services/connectors/mcp/tools";

import {
  ADMIN_READ_SCOPE,
  bearerChallenge,
  mcpResource,
} from "@/lib/mcp-config";
import { publicAppUrl } from "@/lib/public-url";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

/**
 * Remote MCP endpoint (Streamable HTTP, stateless, JSON responses only).
 *
 * Served at the canonical resource `https://mcp.needt.app/mcp` (the
 * middleware rewrites that host's `/mcp` here) and, for clients that send a
 * personal token in a header, at `https://use.needt.app/api/mcp`:
 *
 *   claude mcp add --transport http needt https://use.needt.app/api/mcp \
 *     --header "Authorization: Bearer needt_…"
 *
 * The JSON-RPC layer is written by hand (`src/services/connectors/mcp/`):
 * stateless JSON mode needs only initialize, ping, tools/list and tools/call.
 * JSON-RPC batches are refused (removed from MCP in 2025-06-18).
 */

const ROUTE = "/api/mcp";
const MAX_BODY_BYTES = 256 * 1024;

/** Per person, every call. */
export const MCP_USER_LIMIT_PER_MINUTE = 120;
/** Per person, calls to tools that change something. */
export const MCP_WRITE_LIMIT_PER_MINUTE = 30;
/**
 * Per IP. Generous on purpose: claude.ai and ChatGPT call from a few shared
 * egress addresses, so one IP carries many people.
 */
export const MCP_IP_LIMIT_PER_MINUTE = 600;

function jsonRpcError(status: number, message: string, headers?: HeadersInit) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32000, message } },
    { status, headers }
  );
}

function unauthorized() {
  return jsonRpcError(401, "Unauthorized", {
    "WWW-Authenticate": bearerChallenge(),
  });
}

function methodNotAllowed() {
  return jsonRpcError(405, "Method not allowed", { Allow: "POST" });
}

export async function GET() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}

/** Origins a browser-based client may call from: the app and the MCP host. */
function allowedOrigin(origin: string, request: NextRequest) {
  return (
    origin === publicAppUrl("/", request).origin ||
    origin === new URL(mcpResource()).origin
  );
}

export async function POST(request: NextRequest) {
  // Browsers attach Origin; a page on another site must not drive this
  // endpoint even if it somehow holds a token (DNS-rebinding guard).
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigin(origin, request)) {
    return jsonRpcError(403, "Forbidden origin");
  }

  const ipLimited = await enforceRateLimits(
    [ipRule(request, "mcp:ip", MCP_IP_LIMIT_PER_MINUTE, 60)],
    { route: ROUTE }
  );
  if (ipLimited) return ipLimited;

  const auth = await authenticateBearer(request);
  if (!auth) return unauthorized();

  const userLimited = await enforceRateLimits(
    [accountRule(auth.userId, "mcp:user", MCP_USER_LIMIT_PER_MINUTE, 60)],
    { route: ROUTE, userId: auth.userId }
  );
  if (userLimited) return userLimited;

  // Refuse an oversized body before reading it, then measure what came in
  // bytes (a declared length can be absent or wrong).
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return jsonRpcError(413, "Request too large");
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return jsonRpcError(413, "Request too large");
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json(parseErrorResponse(), { status: 400 });
  }
  if (Array.isArray(body)) {
    return NextResponse.json(batchRejectedResponse(), { status: 400 });
  }

  const call = toolCallOf(body);
  if (call) {
    const needed = requiredScopes(call.tool, call.args);
    if (!hasScopes(auth, needed)) return insufficientScopeResponse(needed);
    if (needed.includes(ADMIN_READ_SCOPE)) {
      // The scope was granted to an admin; the role is read again on every
      // call, so a demoted or deactivated admin is refused at once.
      if (!(await adminCallAllowed({ userId: auth.userId, auth }))) {
        return jsonRpcError(403, "Forbidden: admin role required");
      }
      const adminLimited = await enforceRateLimits(
        [accountRule(auth.userId, "mcp:admin", MCP_ADMIN_LIMIT_PER_MINUTE, 60)],
        { route: ROUTE, userId: auth.userId }
      );
      if (adminLimited) return adminLimited;
    }
    if (isWriteCall(call.tool, call.args)) {
      const writeLimited = await enforceRateLimits(
        [accountRule(auth.userId, "mcp:write", MCP_WRITE_LIMIT_PER_MINUTE, 60)],
        { route: ROUTE, userId: auth.userId }
      );
      if (writeLimited) return writeLimited;
    }
  }

  const response = await handleMcpMessage(
    { request, userId: auth.userId, auth },
    body
  );
  if (!response) return new NextResponse(null, { status: 202 });
  return NextResponse.json(response);
}
