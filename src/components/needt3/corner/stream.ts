/* THE /api/ai/chat WIRE FORMAT — newline-delimited JSON.
 *
 * The route writes one `meta` line, then `token` lines. Kept pure so the
 * buffer handling (a line split across two network chunks) can be checked.
 */

export interface ChatMeta {
  type: "meta";
  conversationId?: string;
  requiresConfirm?: boolean;
  toolName?: string | null;
  toolPayload?: unknown;
  notice?: string;
}

export interface ChatToken {
  type: "token";
  value?: string;
}

export type ChatEvent = ChatMeta | ChatToken;

/** Split complete lines off `buffer`; the unfinished tail comes back as `rest`. */
export function readLines(buffer: string): {
  events: ChatEvent[];
  rest: string;
} {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: ChatEvent[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as ChatEvent;
      if (parsed && (parsed.type === "meta" || parsed.type === "token")) {
        events.push(parsed);
      }
    } catch {
      /* A malformed line is skipped; the rest of the reply still arrives. */
    }
  }
  return { events, rest };
}

/** The task a tool result touched, when it names one. */
export function touchedTaskId(meta: ChatMeta): string | null {
  const p = meta.toolPayload;
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const id = (p as { taskId?: unknown }).taskId;
  return typeof id === "string" && id ? id : null;
}

/**
 * Agent tools that only read (names from src/services/ai/tool-catalog.ts).
 * Kept here as a plain list so the client bundle does not pull the catalog's
 * schemas; a test keeps it in step with the catalog.
 */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "query_schedule",
  "parse_brain_dump",
  "list_pages",
  "search_pages",
  "get_focus_stats",
  "search_mail",
  "get_message",
  "get_user_settings",
  "list_memories",
]);

/**
 * A tool ran that may have changed planner data: not a confirmation ask and
 * not a read. An unknown tool counts as a write, so a refetch is never missed.
 */
export function changedData(meta: ChatMeta): boolean {
  const tool = meta.toolName;
  return (
    !!tool && tool !== "confirmation_required" && !READ_ONLY_TOOLS.has(tool)
  );
}
