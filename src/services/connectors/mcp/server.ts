import { logger } from "@/lib/logger";

import {
  type McpTool,
  type McpToolContext,
  findMcpTool,
  listMcpTools,
  toolError,
} from "./tools";

const LOG_SOURCE = "mcp-server";

export const MCP_SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
] as const;
export const MCP_SERVER_INFO = { name: "needt", version: "1.0.0" };

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

type JsonRpcId = string | number | null;

interface JsonRpcMessage {
  jsonrpc?: unknown;
  id?: JsonRpcId;
  method?: unknown;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string };
}

function result(id: JsonRpcId, value: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result: value };
}

function failure(
  id: JsonRpcId,
  code: number,
  message: string
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export function parseErrorResponse(): JsonRpcResponse {
  return failure(null, PARSE_ERROR, "Parse error");
}

/** Batches were removed from MCP in 2025-06-18; this server never takes one. */
export function batchRejectedResponse(): JsonRpcResponse {
  return failure(null, INVALID_REQUEST, "Batch requests are not supported");
}

/**
 * The tool a `tools/call` message names, with its parsed arguments, so the
 * transport can check scopes and write limits before running it. Null for
 * anything else or for arguments the tool would reject anyway.
 */
export function toolCallOf(
  message: unknown
): { tool: McpTool; args: unknown } | null {
  if (!message || typeof message !== "object") return null;
  const { method, params } = message as JsonRpcMessage;
  if (method !== "tools/call") return null;
  const { name, arguments: rawArgs } = (params ?? {}) as {
    name?: unknown;
    arguments?: unknown;
  };
  const tool = findMcpTool(name);
  if (!tool) return null;
  const parsed = tool.input.safeParse(rawArgs ?? {});
  return parsed.success ? { tool, args: parsed.data } : null;
}

function negotiateProtocol(params: unknown): string {
  const requested =
    params && typeof params === "object"
      ? (params as { protocolVersion?: unknown }).protocolVersion
      : undefined;
  return typeof requested === "string" &&
    (MCP_SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : MCP_SUPPORTED_PROTOCOL_VERSIONS[0];
}

async function callTool(ctx: McpToolContext, id: JsonRpcId, params: unknown) {
  const { name, arguments: rawArgs } = (params ?? {}) as {
    name?: unknown;
    arguments?: unknown;
  };
  const tool = findMcpTool(name);
  if (!tool)
    return failure(id, INVALID_PARAMS, `Unknown tool: ${String(name)}`);

  const parsed = tool.input.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return result(
      id,
      toolError({ error: "Invalid arguments", issues: parsed.error.issues })
    );
  }
  // workspaceId is the transport's business (which workspace to act in),
  // not the tool's: it goes on the context and leaves the arguments.
  const { workspaceId, ...args } = (parsed.data ?? {}) as {
    workspaceId?: string;
  } & Record<string, unknown>;
  try {
    return result(id, await tool.invoke({ ...ctx, workspaceId }, args));
  } catch (error) {
    logger.error(
      "MCP tool failed",
      {
        tool: tool.name,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return result(
      id,
      toolError({ error: "The tool failed. Try again later." })
    );
  }
}

/**
 * Handles one JSON-RPC message. Returns null for notifications and for
 * responses a client sends back, which need no reply.
 */
export async function handleMcpMessage(
  ctx: McpToolContext,
  message: unknown
): Promise<JsonRpcResponse | null> {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return failure(null, INVALID_REQUEST, "Invalid request");
  }
  const { id, method, params } = message as JsonRpcMessage;
  if (typeof method !== "string") {
    // A client response (result/error) or garbage without an id needs no reply.
    return id === undefined || "result" in message || "error" in message
      ? null
      : failure(id ?? null, INVALID_REQUEST, "Invalid request");
  }
  if (id === undefined) return null; // notifications/initialized and friends

  switch (method) {
    case "initialize":
      return result(id, {
        protocolVersion: negotiateProtocol(params),
        capabilities: { tools: { listChanged: false } },
        serverInfo: MCP_SERVER_INFO,
        instructions:
          "Needt holds the person's tasks, projects, calendars, pages, habits and mail. Start with needt_whoami to see the account, scopes and workspaces; find things with needt_search or needt_list, read with needt_get, change with needt_update_task, needt_complete_task, needt_create_task, needt_add_subtasks, needt_complete_subtask, needt_create_event, needt_create_page, needt_append_page, needt_log_habit and needt_control. Break non-trivial work into subtasks: needt_create_task takes entry (the first small step) and subtasks in the order they are done, and the task itself is the closing step. The scheduler places tasks by itself, but you can place one: start on needt_create_task or needt_update_task puts it at that time and pins it so the scheduler leaves it; pinned: false hands it back. Every tool takes an optional workspaceId.",
      });
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, { tools: listMcpTools(ctx.auth.scopes) });
    case "tools/call":
      return callTool(ctx, id, params);
    default:
      return failure(id, METHOD_NOT_FOUND, `Unknown method: ${method}`);
  }
}
