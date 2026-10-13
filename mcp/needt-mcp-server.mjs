#!/usr/bin/env node
/*
 * Needt MCP stdio bridge.
 *
 * Forwards every JSON-RPC message from stdin to Needt's remote MCP endpoint
 * (`${NEEDT_BASE_URL}/api/mcp`) with the personal connector token and writes
 * the reply to stdout. It holds no tool list of its own: the catalogue lives
 * in the web app (src/services/connectors/mcp/tools.ts).
 *
 *   NEEDT_BASE_URL=https://use.needt.app NEEDT_CONNECT_TOKEN=needt_… \
 *     node mcp/needt-mcp-server.mjs
 *
 * Clients that speak Streamable HTTP should connect directly instead:
 *   claude mcp add --transport http needt https://use.needt.app/api/mcp \
 *     --header "Authorization: Bearer needt_…"
 *
 * Framing: newline-delimited JSON (the MCP stdio transport). Messages framed
 * with a Content-Length header are also accepted and answered the same way.
 */

const baseUrl = (process.env.NEEDT_BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  ""
);
const connectToken = process.env.NEEDT_CONNECT_TOKEN;
const workspaceId = process.env.NEEDT_WORKSPACE_ID;
const endpoint = `${baseUrl}/api/mcp`;

let buffer = Buffer.alloc(0);
let framing = "newline";

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (const body of drainMessages()) void forward(body);
});

function* drainMessages() {
  while (buffer.length > 0) {
    const head = buffer.subarray(0, 32).toString("utf8");
    if (/^Content-Length:/i.test(head)) {
      framing = "content-length";
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = buffer.subarray(0, headerEnd).toString("utf8");
      const length = Number(header.match(/Content-Length:\s*(\d+)/i)?.[1]);
      const start = headerEnd + 4;
      if (buffer.length < start + length) return;
      const body = buffer.subarray(start, start + length).toString("utf8");
      buffer = buffer.subarray(start + length);
      yield body;
      continue;
    }
    const newline = buffer.indexOf("\n");
    if (newline === -1) return;
    const line = buffer.subarray(0, newline).toString("utf8").trim();
    buffer = buffer.subarray(newline + 1);
    if (line) yield line;
  }
}

function idsOf(body) {
  try {
    const parsed = JSON.parse(body);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.filter((m) => m && "id" in m && m.method).map((m) => m.id);
  } catch {
    return [null];
  }
}

async function forward(body) {
  const ids = idsOf(body);
  if (!connectToken) {
    for (const id of ids) {
      sendError(id, "NEEDT_CONNECT_TOKEN is required");
    }
    return;
  }
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connectToken}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(workspaceId ? { "x-workspace-id": workspaceId } : {}),
      },
      body,
    });
    if (response.status === 202) return;
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
    if (response.ok && payload) {
      send(JSON.stringify(payload));
      return;
    }
    // Transport-level failures (401, 429, 503) carry no request id; answer
    // each pending request so the client does not hang.
    const reason = payload?.error?.message || payload?.error || "";
    for (const id of ids) {
      sendError(
        id,
        `Needt returned HTTP ${response.status}${reason ? `: ${reason}` : ""}`
      );
    }
  } catch (error) {
    for (const id of ids) {
      sendError(id, error instanceof Error ? error.message : String(error));
    }
  }
}

function sendError(id, message) {
  send(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32603, message } })
  );
}

function send(json) {
  if (framing === "content-length") {
    process.stdout.write(
      `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`
    );
  } else {
    process.stdout.write(`${json}\n`);
  }
}
